# AutoParts Catalog Vercel Demo

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

## Phase 1: Mobile Sales Catalog & Quotation Tool

- Tap a product card (or focus its name and press Enter) to view its photo,
  name, product code, tags, and price. Close with ×, Escape, or the backdrop.
- Share product text using the device's share sheet; choose WhatsApp there.
  When Web Share is unavailable or fails, the tool opens a WhatsApp link.
  Cancelling the share sheet does not open WhatsApp. Photos are not attached.
- Add products to the quotation draft and see the total quantity above search.
  Adding the same product again increases its quantity in the existing row.
  Each row stores a product snapshot (id, code, name), quantity, unit price,
  and line total. Photos remain in the catalog to avoid duplicating image data.
- The draft uses the separate `autoparts_quotation_v1` LocalStorage key;
  existing catalog data and its storage key are unchanged. Deleting a catalog
  product does not remove its quotation snapshot. Storage failures are shown
  on screen; unreadable draft data is preserved instead of overwritten.

Quotation editing, customer information, PDF generation, company branding,
and Supabase are later phases and are not implemented in this version.
