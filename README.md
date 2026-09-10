# TideTracts

Simple PDF contracts and electronic signatures, with native Wavo sharing.

## v0.1

- Sign in with an existing Wavo account
- Upload private PDFs up to 15 MB
- Click to place a signature field on any PDF page
- Secure public signing links
- Draw a signature and generate a completed signed PDF
- Share directly back into a Wavo DM or Space when launched from Wavo

## Stack

Vite + React + Supabase. TideTracts intentionally reuses Wavo's Supabase Auth project so the two products can integrate without a second identity system.

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` can override the checked-in publishable defaults. Never put a Supabase service-role key in the client.
