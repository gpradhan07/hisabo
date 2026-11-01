# The hisabo Shortcut

The Shortcut asks four questions and sends the answers to hisabo:

> How much? → What for? → Note? → Paid with? → **"Saved ₹250.00 · Food & Dining"**

It knows who you are from your **key**, which you get on hisabo's **Add to iPhone** page.

## Build it (once, about 10 minutes)

In the **Shortcuts** app, tap **+** and name it **hisabo**. Then add these actions, searching for each one by name:

| # | Action | Set it to |
|---|---|---|
| 1 | **Text** | Your key, `hk_…`. For now type `KEY`; you'll paste the real key at the end. |
| 2 | **Ask for Input** | Type **Number**, prompt `Amount` |
| 3 | **List** | The categories, one per line: Food & Dining, Groceries, Shopping, Quick Delivery, Rent, Mobile & Internet, Transport, Entertainment, Subscriptions, Home & Maintenance, Health & Medical, Gifts & Donations, Sports, Miscellaneous |
| 4 | **Choose from List** | Prompt `Category` |
| 5 | **Ask for Input** | Type **Text**, prompt `Note (optional)` |
| 6 | **List** | UPI, Credit Card, Debit Card, Cash, Net Banking |
| 7 | **Choose from List** | Prompt `Paid with` |
| 8 | **Get Contents of URL** | See below |
| 9 | **Show Notification** | *Contents of URL* |

### Action 8: Get Contents of URL

- **URL:** hisabo's address from the Add to iPhone page, ending in `/api/ingest`.
- Tap **Show More**, then set **Method** to **POST**.
- Under **Headers**, tap **Add new header**:
  - Key: `Authorization`
  - Text: type `Bearer` and a space, then pick the variable **Text** (action 1).
- Set **Request Body** to **JSON** and add four fields:

| Key | Type | Value (tap **Select Variable**, then tap the action) |
|---|---|---|
| `Amount` | Number | the answer from action 2 |
| `Category` | Text | the chosen item from action 4 |
| `Remark` | Text | the answer from action 5 |
| `PaymentMethod` | Text | the chosen item from action 7 |

## Pair it

1. In hisabo, open **Add to iPhone**, name your iPhone, and tap **Create key**.
2. Tap **Copy** next to the key. If your Mac and iPhone use the same Apple ID, you can paste it straight on the iPhone.
3. In the Shortcut, replace `KEY` in action 1 with your key.

Run the Shortcut. It should end with **"Saved ₹… · …"**.

If you remove the iPhone on the Add to iPhone page, its key stops working at once. To pair again, create a new key and paste it into action 1.

## Sharing it with others

Tap the Shortcut's **⋯ → ⓘ → Setup**, and add an **Import Question** for action 1's text: `Paste your hisabo key`. Clear your own key out of action 1 first. Then use **Share → Copy iCloud Link** and put the link in `SHORTCUT_ICLOUD_URL`. Anyone who adds it from the Add to iPhone page is asked for their own key.

## Other entry types

The same address takes EMIs and investments. Add a `Type` field to the JSON:

| `Type` | Fields |
|---|---|
| `Expense` (default) | `Amount`, `Category`, optional `Remark`, `PaymentMethod`, `CardName`, `Date` |
| `Investment` | `Amount`, `InvestmentType`, `Frequency` (`One-Time`, `Monthly`, `Quarterly`, `Yearly`), optional `PaymentMethod`, `Remark`, `Date` |
| `EMI` | `Amount` (monthly), `Tenure` (months), `EMIName`, `StartDate`, optional `PaymentMethod`, `CardName` |

A `Date` back-dates an entry; hisabo refuses dates in the future.
