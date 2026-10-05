# Shakur Roadside Assistance

One app for chats, jobs, and tire stock.

| Page | Who | What |
|------|-----|------|
| `/book` | Customers | Enter tire size (and optionally a brand, e.g. Goodyear or Michelin) + location → see in-stock tires with installed prices → pick a suggested day (days I'm already working nearby come first) → book. |
| `/jobs` | You | Schedule by day with route + supplier pickups (opens in Google Maps), confirm/text customers, move jobs to better days, create jobs while on the phone, upload supplier stock (CSV), settings. |
| `/` | You | Live chat. Every new booking also opens a chat thread. |

## Run

```bash
npm install
npm run build
npm start            # http://localhost:3000
```

Environment variables:

- `ADMIN_PIN` – protects `/jobs` and every `/api/admin/*` route. **Set this in production**; enter the same PIN once per device.
- `DATA_DIR` – where `db.json` (suppliers, stock, jobs, settings) is saved. Default `./data`. Use a persistent disk.
- `PORT` – default 3000.

## Supplier stock CSV

Download the template from Suppliers & stock → **Template**, or use these columns:

```
supplier,size,brand,model,season,cost,qty,sku
```

Common header names such as "Tire Size", "Price", "Stock" and "On Hand" are recognised. Sizes like `225 65 17`, `P225/65R17` or `2256517` all become `225/65R17`. Upload a file on a supplier's card to replace that supplier's list, or use the top upload button for a file that has a `supplier` column.

## How suggestions work

- **Days:** for each open slot, the app calculates how much extra driving the job adds between your previous and next stops that day (starting and ending at your base). Days when you're already nearby rank first.
- **Seasonal swap:** the customer says whether their tires are already on rims. If not, the "mount & balance" extra (Settings) is added and the job card reminds you to bring the tire machine.
- **Tires:** the customer pays supplier cost + markup % + service fee. The ranking weighs price against the extra km to the supplier (Settings → Driving cost $/km). Customers never see supplier names or costs.
- **Supplier pickup:** at booking, the job is assigned to whichever supplier with that tire is most on the way, as long as it isn't more expensive than the price the customer was quoted. The stock is reserved and released again if the job is cancelled.
- **Weather:** the Open-Meteo forecast nudges customers to swap before the first snow.
