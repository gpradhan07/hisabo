/**
 * hisabo backend v4 — backward-compatible with older Shortcuts and the dashboard.
 *
 * doPost Types (Date is optional for the Shortcut types: it defaults to now, and can't be in the future):
 *   Expense / ManualExpense*       Amount, Category, Merchant, Remark, PaymentMethod, CardName, Date
 *   Subscription                   Amount, Name, Frequency (Weekly/Monthly/Quarterly/Yearly/One-time),
 *                                  AutoRenew (Yes/No), PaymentMethod, CardName, Remark, Date
 *   Investment / ManualInvestment* Amount, InvestmentType, InvestmentName, Frequency, Platform,
 *                                  PaymentMethod, CardName, Remark, Date
 *   EMI                            Amount (monthly), EMIName, Tenure, StartDate, EMIType, PaidBefore,
 *                                  PaymentMethod, CardName, Remark
 *   EMIPayment                     Amount, EMIName (an EMI already in the EMI tab), PaymentMethod,
 *                                  CardName, Remark, Date
 *   Profile*                       Name, Email, MonthlyIncome, MonthlyBudget, Payday
 *   (* = must also send Key: the dashboard key, and a Date)
 * doGet?key=…  → { expenses, subscriptions, emis, emiPayments, investments, profile } for the dashboard.
 *
 * Updating: paste this file over the old code → Save → Deploy → Manage deployments →
 * ✏️ Edit → Version: "New version" → Deploy (keeps the same URL for the Shortcut).
 * New columns are added at the end of existing tabs, so older rows keep working.
 * setupDashboardKey / setupLiveUpdates only need running once; their values are already saved.
 */
const PROFILE_FIELDS = [
  ['name','Name','Name'],['email','Email','Email'],
  ['monthlyIncome','Monthly income','MonthlyIncome'],
  ['monthlyBudget','Monthly budget','MonthlyBudget'],
  ['payday','Payday (day of month)','Payday']
];
const EXPENSE_HEADERS = ['Date','Amount','Category','Remark','Payment Method','Card Name','Merchant'];
const SUBSCRIPTION_HEADERS = ['Date','Amount','Name','Frequency','Auto Renew','Payment Method','Card Name','Remark'];
const EMI_HEADERS = ['Date Added','EMI Name','Monthly EMI','Tenure (Months)','Total Payable','Start Date','Payment Method','Card Name','EMI Type','Paid Before','Remark'];
const EMI_PAYMENT_HEADERS = ['Date','EMI Name','Amount','Payment Method','Card Name','Remark'];
const INVESTMENT_HEADERS = ['Date','Amount','Investment Type','Frequency','Payment Method','Remark','Investment Name','Platform','Card Name'];

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = JSON.parse(e.postData.contents);
    const type = clean_(data.Type) || 'Expense';
    // "EMI Payment", "emi_payment" and "EMIPayment" all mean the same thing.
    const t = type.toLowerCase().replace(/[\s_-]/g, '');
    const amount = amount_(data.Amount);
    const positive = function() { if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid amount'); };
    if (t === 'expense' || t === 'manualexpense') {
      if (t === 'manualexpense') requireDashboardKey_(data);
      const sheet = ensureSheet_(ss, 'Expenses', EXPENSE_HEADERS);
      positive();
      const category = clean_(data.Category);
      if (!category) throw new Error('Category is required');
      sheet.appendRow([when_(data, t === 'manualexpense'), amount, category, clean_(data.Remark), payment_(data),
        clean_(data.CardName), clean_(data.Merchant)]);
    } else if (t === 'subscription') {
      const sheet = ensureSheet_(ss, 'Subscriptions', SUBSCRIPTION_HEADERS);
      positive();
      const name = clean_(data.Name || data.SubscriptionName);
      if (!name) throw new Error('Subscription name is required');
      const frequency = frequency_(data.Frequency || 'Monthly');
      // One-time payments never renew; otherwise renewal is on unless the Shortcut says "No".
      const autoRenew = frequency === 'One-time' || /^(n|no|false|0)$/i.test(clean_(data.AutoRenew)) ? 'No' : 'Yes';
      sheet.appendRow([when_(data, false), amount, name, frequency, autoRenew, payment_(data),
        clean_(data.CardName), clean_(data.Remark)]);
    } else if (t === 'emi') {
      const sheet = ensureSheet_(ss, 'EMI', EMI_HEADERS);
      const tenure = Number(data.Tenure);
      const paidBefore = clean_(data.PaidBefore) === '' ? 0 : Number(data.PaidBefore);
      if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(tenure) || tenure <= 0 ||
          !clean_(data.EMIName) || !data.StartDate) throw new Error('Invalid EMI details');
      if (!Number.isInteger(paidBefore) || paidBefore < 0 || paidBefore > tenure)
        throw new Error('Instalments already paid must be a whole number from 0 to ' + tenure);
      sheet.appendRow([new Date(), clean_(data.EMIName), amount, tenure, Math.round(amount * tenure * 100) / 100,
        data.StartDate, payment_(data), clean_(data.CardName), clean_(data.EMIType), paidBefore, clean_(data.Remark)]);
    } else if (t === 'emipayment') {
      positive();
      const name = clean_(data.EMIName);
      if (!name) throw new Error('EMI name is required');
      // A payment belongs to an EMI that exists, so a typo can't start a second, phantom EMI.
      const emi = readEmis_(ss).filter(function(m) { return m.name.toLowerCase() === name.toLowerCase(); })[0];
      if (!emi) throw new Error('No EMI called "' + name + '". Add it with New EMI first.');
      const sheet = ensureSheet_(ss, 'EMI Payments', EMI_PAYMENT_HEADERS);
      sheet.appendRow([when_(data, false), emi.name, amount, payment_(data), clean_(data.CardName), clean_(data.Remark)]);
    } else if (t === 'investment' || t === 'manualinvestment') {
      if (t === 'manualinvestment') requireDashboardKey_(data);
      const sheet = ensureSheet_(ss, 'Investments', INVESTMENT_HEADERS);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid investment amount');
      const kind = clean_(data.InvestmentType || data.Category);
      if (!kind) throw new Error('Investment type is required');
      sheet.appendRow([when_(data, t === 'manualinvestment'), amount, kind, clean_(data.Frequency || 'One-Time'),
        payment_(data), clean_(data.Remark), clean_(data.InvestmentName || data.Name), clean_(data.Platform), clean_(data.CardName)]);
    } else if (t === 'profile') {
      requireDashboardKey_(data);
      saveProfile_(ss, data);
    } else {
      throw new Error('Unknown transaction type');
    }
    try { notifyDashboard_(type); } catch (err) { console.warn('Dashboard ping failed: ' + err.message); }
    return ContentService.createTextOutput('Success - Type: ' + type);
  } catch (error) {
    return ContentService.createTextOutput('Error: ' + error.message);
  }
}
function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const expected = PropertiesService.getScriptProperties().getProperty('DASHBOARD_KEY');
    if (!expected) return json_({ok:false,error:'Dashboard key not set up. Run setupDashboardKey().'});
    if (params.key !== expected) return json_({ok:false,error:'Unauthorized'});
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    return json_({ok:true,generatedAt:new Date().toISOString(),
      expenses:readExpenses_(ss),subscriptions:readSubscriptions_(ss),emis:readEmis_(ss),
      emiPayments:readEmiPayments_(ss),investments:readInvestments_(ss),profile:readProfile_(ss)});
  } catch (error) { return json_({ok:false,error:error.message}); }
}
function clean_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
/** 250, "250", "1,250.50", "₹250", "Rs. 250" → a number (NaN when there's none). */
function amount_(v) {
  if (typeof v === 'number') return v;
  const m = clean_(v).match(/-?\d[\d,]*(?:\.\d+)?/);
  return m ? Number(m[0].replace(/,/g, '')) : NaN;
}
/** The entry's date: data.Date when sent, otherwise now (`required` for dashboard entries). Never in the future. */
function when_(data, required) {
  const raw = clean_(data.Date);
  if (!raw) { if (required) throw new Error('Invalid date'); return new Date(); }
  const when = new Date(raw);
  if (isNaN(when.getTime())) throw new Error('Invalid date');
  if (when.getTime() > Date.now() + 600000) throw new Error('Date cannot be in the future');
  return when;
}
/** "monthly", "Annual", "one time"… → Weekly / Monthly / Quarterly / Yearly / One-time. */
function frequency_(v) {
  const s = clean_(v).toLowerCase().replace(/[\s_-]+/g, '');
  if (s === 'weekly' || s === 'week') return 'Weekly';
  if (s === 'monthly' || s === 'month') return 'Monthly';
  if (s === 'quarterly' || s === 'quarter') return 'Quarterly';
  if (s === 'yearly' || s === 'annual' || s === 'annually' || s === 'year') return 'Yearly';
  if (s === 'onetime' || s === 'once') return 'One-time';
  return clean_(v);
}
function payment_(data) { return clean_(data.PaymentMethod || data.PaymentMode || data.Payment); }
function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.getRange(1,1,1,headers.length).setValues([headers]);
  else {
    // Keep existing column order; add new headers only in empty trailing positions.
    const width = Math.max(sheet.getLastColumn(), headers.length);
    const existing = sheet.getRange(1,1,1,width).getValues()[0];
    // Expenses legacy sheets may have no header; never overwrite transaction data.
    if (name === 'Expenses' && existing[0] instanceof Date) {
      // Old headerless Expenses sheet: append values to columns E/F, no header insertion.
      return sheet;
    }
    for (let i=0;i<headers.length;i++) {
      if (existing[i] === '' || existing[i] === null) sheet.getRange(1,i+1).setValue(headers[i]);
      // Different wording ("Remarks", "Date added") is only a label: warn, but never block the write.
      else if (clean_(existing[i]).toLowerCase() !== headers[i].toLowerCase())
        console.warn(name + ' column ' + (i+1) + ' is "' + existing[i] + '", expected "' + headers[i] + '"');
    }
  }
  return sheet;
}
function readExpenses_(ss) {
  const sheet=ss.getSheetByName('Expenses'); if (!sheet || sheet.getLastRow()===0) return [];
  const out=[]; sheet.getDataRange().getValues().forEach(function(r,i){
    const date=toIso_(r[0]); if (!date || r[1]==='') return;
    out.push({row:i+1,date:date,amount:r[1],category:clean_(r[2]),remark:clean_(r[3]),
      paymentMethod:clean_(r[4]),cardName:clean_(r[5]),merchant:clean_(r[6])});
  }); return out;
}
function readSubscriptions_(ss) {
  const sheet=ss.getSheetByName('Subscriptions'); if (!sheet || sheet.getLastRow()<2) return [];
  const out=[]; sheet.getDataRange().getValues().forEach(function(r,i){
    if(i===0 || !r[2] || r[1]==='') return;
    out.push({row:i+1,date:toIso_(r[0]),amount:r[1],name:clean_(r[2]),frequency:clean_(r[3]),autoRenew:clean_(r[4]),
      paymentMethod:clean_(r[5]),cardName:clean_(r[6]),remark:clean_(r[7])});
  }); return out;
}
function readEmis_(ss) {
  const sheet=ss.getSheetByName('EMI'); if (!sheet || sheet.getLastRow()<2) return [];
  const out=[]; sheet.getDataRange().getValues().forEach(function(r,i){
    if(i===0 || !r[1]) return;
    out.push({row:i+1,addedOn:toIso_(r[0]),name:clean_(r[1]),monthly:r[2],tenure:r[3],total:r[4],
      startDate:r[5] instanceof Date?r[5].toISOString():clean_(r[5]),
      paymentMethod:clean_(r[6]),cardName:clean_(r[7]),emiType:clean_(r[8]),paidBefore:r[9],remark:clean_(r[10])});
  }); return out;
}
function readEmiPayments_(ss) {
  const sheet=ss.getSheetByName('EMI Payments'); if (!sheet || sheet.getLastRow()<2) return [];
  const out=[]; sheet.getDataRange().getValues().forEach(function(r,i){
    if(i===0 || !r[1] || r[2]==='') return;
    out.push({row:i+1,date:toIso_(r[0]),emiName:clean_(r[1]),amount:r[2],paymentMethod:clean_(r[3]),
      cardName:clean_(r[4]),remark:clean_(r[5])});
  }); return out;
}
function readInvestments_(ss) {
  const sheet=ss.getSheetByName('Investments'); if(!sheet || sheet.getLastRow()<2) return [];
  const out=[]; sheet.getDataRange().getValues().forEach(function(r,i){
    if(i===0 || r[1]==='') return;
    out.push({row:i+1,date:toIso_(r[0]),amount:r[1],investmentType:clean_(r[2]),
      frequency:clean_(r[3]),paymentMethod:clean_(r[4]),remark:clean_(r[5]),
      investmentName:clean_(r[6]),platform:clean_(r[7]),cardName:clean_(r[8])});
  }); return out;
}
function requireDashboardKey_(data) {
  const expected=PropertiesService.getScriptProperties().getProperty('DASHBOARD_KEY');
  if(!expected || data.Key!==expected) throw new Error('Unauthorized');
}
function readProfile_(ss) {
  const sheet=ss.getSheetByName('Profile'); if(!sheet || sheet.getLastRow()<2) return null;
  const byLabel={}; sheet.getRange(2,1,sheet.getLastRow()-1,2).getValues().forEach(function(r){byLabel[clean_(r[0]).toLowerCase()]=r[1];});
  const out={}; PROFILE_FIELDS.forEach(function(f){const v=byLabel[f[1].toLowerCase()];if(v!=='' && v!==null && v!==undefined)out[f[0]]=v;});
  return out.name?out:null;
}
function saveProfile_(ss,data) {
  if(!clean_(data.Name)) throw new Error('Name is required');
  const sheet=ss.getSheetByName('Profile')||ss.insertSheet('Profile');
  const rows=[['Field','Value']].concat(PROFILE_FIELDS.map(function(f){return[f[1],data[f[2]]==null?'':data[f[2]]];}));
  sheet.clearContents(); sheet.getRange(1,1,rows.length,2).setValues(rows);
}
function toIso_(value) {
  if(value instanceof Date && !isNaN(value.getTime()))return value.toISOString();
  if(typeof value==='string' && value){const d=new Date(value);if(!isNaN(d.getTime()))return d.toISOString();}
  return null;
}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
function notifyDashboard_(reason) {
  const p=PropertiesService.getScriptProperties().getProperties();
  if(!p.PUSHER_APP_ID||!p.PUSHER_KEY||!p.PUSHER_SECRET||!p.PUSHER_CLUSTER||!p.PUSHER_CHANNEL)return false;
  const body=JSON.stringify({name:'sheet-updated',channels:[p.PUSHER_CHANNEL],data:JSON.stringify({reason:reason,at:new Date().toISOString()})});
  const path='/apps/'+p.PUSHER_APP_ID+'/events';
  const bodyMd5=hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,body,Utilities.Charset.UTF_8));
  const query='auth_key='+p.PUSHER_KEY+'&auth_timestamp='+Math.floor(Date.now()/1000)+'&auth_version=1.0&body_md5='+bodyMd5;
  const signature=hex_(Utilities.computeHmacSha256Signature('POST\n'+path+'\n'+query,p.PUSHER_SECRET));
  const res=UrlFetchApp.fetch('https://api-'+p.PUSHER_CLUSTER+'.pusher.com'+path+'?'+query+'&auth_signature='+signature,
    {method:'post',contentType:'application/json',payload:body,muteHttpExceptions:true});
  if(res.getResponseCode()!==200){console.warn('Pusher responded '+res.getResponseCode()+': '+res.getContentText());return false;}
  return true;
}
function onSheetChange(e){notifyDashboard_(e&&e.changeType?e.changeType:'edit');}
function setupLiveUpdates() {
  const PUSHER={appId:'',key:'',secret:'',cluster:''};
  const props=PropertiesService.getScriptProperties();
  if(PUSHER.appId&&PUSHER.key&&PUSHER.secret&&PUSHER.cluster)props.setProperties({
    PUSHER_APP_ID:String(PUSHER.appId).trim(),PUSHER_KEY:PUSHER.key.trim(),
    PUSHER_SECRET:PUSHER.secret.trim(),PUSHER_CLUSTER:PUSHER.cluster.trim()});
  if(!props.getProperty('PUSHER_CHANNEL'))props.setProperty('PUSHER_CHANNEL','expenses-'+Utilities.getUuid().replace(/-/g,'').slice(0,20));
  const p=props.getProperties();
  if(!p.PUSHER_APP_ID||!p.PUSHER_KEY||!p.PUSHER_SECRET||!p.PUSHER_CLUSTER)throw new Error('Paste your Pusher credentials first.');
  ScriptApp.getProjectTriggers().forEach(function(t){if(t.getHandlerFunction()==='onSheetChange')ScriptApp.deleteTrigger(t);});
  ScriptApp.newTrigger('onSheetChange').forSpreadsheet(SpreadsheetApp.getActive()).onChange().create();
  Logger.log(notifyDashboard_('setup')?'Live updates are on.':'Pusher rejected test message.');
  Logger.log('PUSHER_KEY='+p.PUSHER_KEY+'\nPUSHER_CLUSTER='+p.PUSHER_CLUSTER+'\nPUSHER_CHANNEL='+p.PUSHER_CHANNEL);
}
function hex_(bytes){return bytes.map(function(b){return('0'+(b&255).toString(16)).slice(-2);}).join('');}
function setupDashboardKey(){const props=PropertiesService.getScriptProperties();let key=props.getProperty('DASHBOARD_KEY');if(!key){key=(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,'');props.setProperty('DASHBOARD_KEY',key);}Logger.log('Your dashboard key: '+key);}
