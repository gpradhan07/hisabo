/**
 * hisabo backend v3 — backward-compatible with the original Shortcut and dashboard.
 *
 * doPost Types:
 *   Expense / ManualExpense*      Amount, Category, Remark, PaymentMethod, CardName (+ Date for Manual)
 *   EMI                           Amount (monthly), Tenure, EMIName, StartDate, PaymentMethod, CardName
 *   Investment / ManualInvestment* Amount, InvestmentType, Frequency, PaymentMethod, Remark (+ Date for Manual)
 *   Profile*                      Name, Email, MonthlyIncome, MonthlyBudget, Payday
 *   (* = must also send Key: the dashboard key)
 * doGet?key=…  → { expenses, emis, investments, profile } for the dashboard.
 *
 * Updating: paste this file over the old code → Save → Deploy → Manage deployments →
 * ✏️ Edit → Version: "New version" → Deploy (keeps the same URL for the Shortcut).
 * setupDashboardKey / setupLiveUpdates only need running once; their values are already saved.
 */
const PROFILE_FIELDS = [
  ['name','Name','Name'],['email','Email','Email'],
  ['monthlyIncome','Monthly income','MonthlyIncome'],
  ['monthlyBudget','Monthly budget','MonthlyBudget'],
  ['payday','Payday (day of month)','Payday']
];
const EXPENSE_HEADERS = ['Date','Amount','Category','Remark','Payment Method','Card Name'];
const EMI_HEADERS = ['Date Added','EMI Name','Monthly EMI','Tenure (Months)','Total Payable','Start Date','Payment Method','Card Name'];
const INVESTMENT_HEADERS = ['Date','Amount','Investment Type','Frequency','Payment Method','Remark'];

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = JSON.parse(e.postData.contents);
    const type = data.Type || 'Expense';
    const amount = amount_(data.Amount);
    if (type === 'Expense' || type === 'ManualExpense') {
      if (type === 'ManualExpense') requireDashboardKey_(data);
      const sheet = ensureSheet_(ss, 'Expenses', EXPENSE_HEADERS);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid amount');
      const category = clean_(data.Category);
      if (!category) throw new Error('Category is required');
      const when = type === 'ManualExpense' ? new Date(data.Date) : new Date();
      if (isNaN(when.getTime())) throw new Error('Invalid date');
      if (when.getTime() > Date.now() + 600000) throw new Error('Date cannot be in the future');
      sheet.appendRow([when, amount, category, clean_(data.Remark), payment_(data), clean_(data.CardName)]);
    } else if (type === 'EMI') {
      const sheet = ensureSheet_(ss, 'EMI', EMI_HEADERS);
      const tenure = Number(data.Tenure);
      if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(tenure) || tenure <= 0 ||
          !clean_(data.EMIName) || !data.StartDate) throw new Error('Invalid EMI details');
      sheet.appendRow([new Date(), clean_(data.EMIName), amount, tenure, amount * tenure,
        data.StartDate, payment_(data), clean_(data.CardName)]);
    } else if (type === 'Investment' || type === 'ManualInvestment') {
      if (type === 'ManualInvestment') requireDashboardKey_(data);
      const sheet = ensureSheet_(ss, 'Investments', INVESTMENT_HEADERS);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid investment amount');
      const kind = clean_(data.InvestmentType || data.Category);
      if (!kind) throw new Error('Investment type is required');
      const when = type === 'ManualInvestment' ? new Date(data.Date) : new Date();
      if (isNaN(when.getTime()) || when.getTime() > Date.now() + 600000) throw new Error('Invalid investment date');
      sheet.appendRow([when, amount, kind, clean_(data.Frequency || 'One-Time'),
        payment_(data), clean_(data.Remark)]);
    } else if (type === 'Profile') {
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
      expenses:readExpenses_(ss),emis:readEmis_(ss),investments:readInvestments_(ss),profile:readProfile_(ss)});
  } catch (error) { return json_({ok:false,error:error.message}); }
}
function clean_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
/** 250, "250", "1,250.50", "₹250", "Rs. 250" → a number (NaN when there's none). */
function amount_(v) {
  if (typeof v === 'number') return v;
  const m = clean_(v).match(/-?\d[\d,]*(?:\.\d+)?/);
  return m ? Number(m[0].replace(/,/g, '')) : NaN;
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
      paymentMethod:clean_(r[4]),cardName:clean_(r[5])});
  }); return out;
}
function readEmis_(ss) {
  const sheet=ss.getSheetByName('EMI'); if (!sheet || sheet.getLastRow()<2) return [];
  const out=[]; sheet.getDataRange().getValues().forEach(function(r,i){
    if(i===0 || !r[1]) return;
    out.push({row:i+1,addedOn:toIso_(r[0]),name:clean_(r[1]),monthly:r[2],tenure:r[3],total:r[4],
      startDate:r[5] instanceof Date?r[5].toISOString():clean_(r[5]),
      paymentMethod:clean_(r[6]),cardName:clean_(r[7])});
  }); return out;
}
function readInvestments_(ss) {
  const sheet=ss.getSheetByName('Investments'); if(!sheet || sheet.getLastRow()<2) return [];
  const out=[]; sheet.getDataRange().getValues().forEach(function(r,i){
    if(i===0 || r[1]==='') return;
    out.push({row:i+1,date:toIso_(r[0]),amount:r[1],investmentType:clean_(r[2]),
      frequency:clean_(r[3]),paymentMethod:clean_(r[4]),remark:clean_(r[5])});
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
