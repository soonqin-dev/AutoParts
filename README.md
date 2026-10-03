# SalesGo

**Mobile Sales Catalog & Quotation Tool · 移动产品目录与报价工具**

A lightweight, mobile-first sales tool for businesses in any industry. Search
products, show details, share a complete product card, and generate quotations.

## Run locally

Use Node.js 24.x. Framework versions are pinned to Next.js 16.3.8 and
React/React DOM 19.3.0; commit `package-lock.json` with dependency updates.
The default development and production compiler is Turbopack. Supported browser
minimums are Safari 16.4+, Chrome/Edge 111+, and Firefox 111+.

```bash
npm install
npm run dev
```

Open http://localhost:3000. Use `npm run build` for a production build.

Run `npm test` for image-upload compatibility regression checks. Before release,
verify photo and transparent-logo uploads on Android Chrome and iPhone Safari,
including saving, refreshing, product-card download, and quotation PDF generation.
Browser simulations cover WebP fallback, but do not replace physical-device checks.

## Deploy to Vercel

Import the GitHub repository as a Next.js project and deploy. Push the tested
commit to GitHub; a connected Vercel project will deploy the update. Verify the
deployment commit matches your latest commit. The `engines.node` field pins the
Vercel runtime to Node.js 24.x. Keep build/install defaults and the committed
lockfile; do not overwrite newer files with an older release ZIP.

The tool uses Next.js 14, React, and LocalStorage. The repository name does not
determine the displayed brand. All image processing and PDF generation run on
the device; no server upload, WhatsApp API, or Supabase connection is required.

## Product catalog and editing

- Search by product code, name, or tags. Tap a card or focus its name and press
  Enter to view its photo, name, code, tags, and price.
- Add, edit, or delete a product. Editing retains its ID and photo unless the
  salesperson replaces/removes the photo. Cancelling discards form changes.
- Prices must be nonnegative amounts with up to two decimal places.
- Close details with ×, Escape, or the backdrop. The selected company's name
  and logo appear when configured. Fresh installs have generic sample products;
  existing products are never renamed or replaced with samples.

## Mobile image uploads

- Product uploads accept JPG/JPEG, PNG, WebP, and HEIC/HEIF, up to 12MB /
  40 megapixels. HEIC/HEIF requires browser decoding support; otherwise a clear
  message asks the user to export JPG or upload a screenshot.
- The browser decodes image orientation, fits the longest side within 1600px
  without upscaling, and prefers WebP at quality 0.82. If WebP encoding fails,
  photos fall back to JPEG (then PNG if necessary); PNG/WebP sources fall back
  to PNG to preserve transparency. The Data URL records the actual output format.
- Only the processed image Data URL is saved. A progress state prevents saving
  before conversion completes. Closing/reopening a form discards pending results.
- Invalid, oversized, or unsupported images show an error; the previous photo
  stays intact. Browsers without WebP encoding use compatible formats automatically;
  failed encodes are distinguished from unreadable files in the error messages.
- Existing photos remain in their original format until replaced. Company logo
  uploads (up to 1MB) use the same conversion and compatibility handling.
- LocalStorage has a browser-dependent capacity. Failed saves show a warning;
  keep the page open until the data can be saved. Clearing browser data removes
  local products and quotations.

## WhatsApp product cards

- Opening product details prepares one JPG card containing the product photo,
  full name, product code, price, tags, and the company's name/logo if configured.
  Products without photos use a clean placeholder. Long text wraps.
- Tap **分享卡片到 WhatsApp** and choose WhatsApp in the system share sheet.
  The file is prepared before the tap, preserving mobile user activation.
- The share payload contains only the JPG. Product information is drawn into
  that image, so WhatsApp cannot drop a separate caption or text payload.
- **下载产品卡片** is always available when the card is ready. If native sharing
  is unsupported or fails, download the JPG and send it as a photo in WhatsApp.
  Cancelling the share sheet does not navigate to another app.
- Use HTTPS and a current Safari/Chrome browser for native file sharing.
  Automated browser checks verify the actual JPG/PDF file payloads; sending to
  a real WhatsApp contact still needs a phone with WhatsApp installed.

## Quotation workflow

- Add products from details, then open **查看 / 生成报价** above search or
  **查看报价清单** in details. Repeat additions increase the existing row's quantity.
- Edit quantities/unit prices, remove rows, and enter customer name/phone, date,
  notes, and a fixed amount discount. Customer name is required; phone is optional.
- Calculations use integer cents. Discounts cannot exceed the subtotal. Invalid
  in-progress item edits disable export and retain the last valid saved values.
- Company name starts empty and must be entered before PDF generation. Expand
  **公司资料（用于报价与产品卡片）** to configure the company's name, contact, and logo.
  SalesGo is the tool's brand; customer PDFs use the salesperson's company.
- Tap **生成报价 PDF**, then **下载 PDF** or **分享 PDF**. If native PDF sharing is
  unavailable, download and attach it as a document in WhatsApp. Edits invalidate
  the generated file; regenerate before downloading/sharing.
- A4 PDFs include company branding/contact, quotation number/date, customer,
  product rows and amounts, subtotal/discount/total, notes, and page numbers.
  Rows and notes paginate. Browser fonts support Chinese and other installed
  fonts. Pages are rasterized at 2× resolution; text is not selectable. jsPDF
  loads only when generating a PDF.
- **新建报价** clears the current customer/items after confirmation and generates
  a new number/date while retaining company settings. Editing/deleting a catalog
  product does not rewrite a quotation's saved product snapshot or unit price.

## LocalStorage migration

| Previous key | SalesGo key |
| --- | --- |
| `autoparts_catalog_vercel_demo_v1` | `salesgo_catalog_v1` |
| `autoparts_quotation_v1` | `salesgo_quotation_v1` |
| `autoparts_quotation_details_v1` | `salesgo_quotation_details_v1` |

On first use at the **same website origin**, valid legacy data is copied into
the corresponding new key. An existing SalesGo key always takes precedence,
including an empty catalog/draft. Legacy keys stay untouched as backups.
IDs, photos, quotation rows/prices, customer details, and company settings are
retained. Only the old unused default company name (with no contact or logo)
becomes empty; entered branding is preserved.

Corrupt data or a failed migration is shown on screen and is never overwritten
with samples or an empty draft. Storage capacity must accommodate the new copy
and the retained backup. A different domain, protocol, or port has separate
LocalStorage; automatic migration cannot read another origin's data.

## Supabase connection setup

Copy `.env.example` to `.env.local` and fill in the Project URL and publishable
key. `.env.local` is ignored by Git. Set the same two variables in the Vercel
project's environment variables and redeploy when they change. Never put a secret
or service-role key in a `NEXT_PUBLIC_` variable.

Run `npm run check:supabase` to verify the Auth endpoint accepts the connection
details. This read-only check does not create users or modify database data.
The browser client utility is in `lib/supabase/client.js`. `/account` supports
email/password registration, login, verification email resend, company creation,
membership display, and device-local sign-out. Apply
`supabase/migrations/202610030001_company_accounts.sql` once in SQL Editor before
using company creation. Do not rerun the migration after successful application.
Set Auth Site URL to the production origin and allow these exact Redirect URLs:
`https://salesgo-tool.vercel.app/auth/callback` and
`http://localhost:3000/auth/callback` for local testing. Keep email confirmation
enabled. PKCE verification links should be opened in the registration browser;
if opened elsewhere, try password login after confirming the email.

The current Auth implementation is browser-only; it does not authorize server
routes with cookies. Company reads and creation are authorized by Supabase Auth,
table grants, RLS, and the limited `create_company` RPC, not UI state. No secret
key is used. Each account can create one company; repeated requests return the
existing company without reactivating a disabled membership. Members can read
their own active membership and its company only. Invitations, roster management,
company editing, password recovery, quotas, and billing are not implemented yet.

Products, photos, quotation drafts, and quotation company branding remain in
LocalStorage and are not partitioned by signed-in user. Sign-out does not erase
these records; do not treat shared-device local data as private company data.
Cloud product/quotation migration and Storage policies are a separate next step.
Any future server-protected pages will also need server session validation and
session refresh middleware before deployment.

This is a catalog and quotation tool;
inventory, POS checkout, payments, invoices, accounting, and ERP are out of scope.
