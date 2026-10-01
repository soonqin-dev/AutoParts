# AutoParts — Mobile Sales Catalog & Quotation Tool

## Local run
```bash
npm install
npm run dev
```

Open http://localhost:3000

## Deploy to Vercel
1. Upload this project to GitHub.
2. In Vercel, click Add New > Project.
3. Import the GitHub repository.
4. Framework should be detected as Next.js.
5. Click Deploy.

This demo stores data in browser LocalStorage.
The next version can be upgraded to Supabase Database + Storage.

## Sales workflow

- Tap a product card (or focus its name and press Enter) to view its photo,
  name, product code, tags, and price. Close with ×, Escape, or the backdrop.
- Share a product's photo and text using the device's file share sheet; choose
  WhatsApp there. Image conversion happens locally and does not upload the photo.
  The receiving app controls how it presents photo captions/text.
  If file sharing is unsupported or fails, save the photo and open the WhatsApp
  text link, then attach the saved photo manually. WhatsApp links cannot attach
  local files. Products without a photo use text sharing / a WhatsApp text link.
  Cancelling a share sheet does not trigger another share or navigation.
- Add products to the quotation draft and see the total quantity above search.
  Adding the same product again increases its quantity in the existing row.
  Each row stores a product snapshot (id, code, name), quantity, unit price,
  and line total. Photos remain in the catalog to avoid duplicating image data.
- Tap **查看 / 生成报价** above search, or **查看报价清单** in product details.
  Edit quantity and unit price, remove rows, enter customer name/phone, date,
  notes, and a fixed amount discount. Customer name is required; phone is optional.
  Amounts are calculated in integer cents; discounts cannot exceed the subtotal.
  Quantity is a positive integer, unit price is nonnegative with up to two decimal
  places. Invalid in-progress edits disable PDF generation and do not overwrite
  the last valid saved item values.
- Expand **公司资料（用于 PDF）** to set the company name, contact information,
  and optional logo (PNG/JPG/WebP, under 1MB). These settings stay on this device.
- Tap **生成报价 PDF**, then **下载 PDF** or **分享 PDF**. A second tap for sharing
  keeps the browser's user activation intact on mobile. Select WhatsApp in the
  system share sheet. If PDF sharing is unsupported, download the file and attach
  it as a document in WhatsApp. Changing any quotation field invalidates the
  generated file; regenerate it before downloading/sharing.
- PDF export runs entirely in the browser. jsPDF is loaded only on demand.
  A4 pages include company logo/name/contact, quotation number/date, customer
  information, product rows, quantity/unit price/line totals, subtotal/discount/
  total, notes, and page numbers. Rows and notes paginate. Browser-rendered text
  supports Chinese and other installed fonts; PDF pages are rasterized at 2×
  resolution, so text is not selectable. No print dialog or server is required.
- **新建报价** clears the current items/customer fields after confirmation and
  creates a new quotation number/date while retaining company settings.
- The draft uses the separate `autoparts_quotation_v1` LocalStorage key;
  existing catalog data and its storage key are unchanged. Deleting a catalog
  product does not remove its quotation snapshot. Storage failures are shown
  on screen; unreadable draft data is preserved instead of overwritten.
- Customer information, quotation fields, and company settings use
  `autoparts_quotation_details_v1`. Phase 1 quotation rows load without migration.

Use HTTPS (Vercel provides it) and a browser with file-sharing support for native
photo/PDF sharing. Browser tests can verify file payloads; sending to a real
WhatsApp contact needs a phone with WhatsApp installed.

Product editing and Supabase are not implemented. There is no inventory,
checkout, payment, invoice, accounting, CRM, or order-management functionality.
