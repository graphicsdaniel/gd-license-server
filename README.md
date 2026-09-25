# GD AUTO COUNT — License Server

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Go to vercel.com → New Project → import the repo
3. Add these Environment Variables in Vercel settings:

   | Variable            | Value                        |
   |---------------------|------------------------------|
   | GMAIL_USER          | graphicsdanielgraphics@gmail.com |
   | GMAIL_APP_PASSWORD  | your-16-char-app-password    |
   | SECRET_SALT         | GD@aut0c0unt#2024!x          |

4. Deploy → copy your Vercel URL e.g. https://gd-license-server.vercel.app

## Set up Gumroad Ping

1. Go to Gumroad → your product → Edit
2. Scroll to Advanced → Ping URL
3. Paste: https://gd-license-server.vercel.app/api/ping
4. Save

## How it works

Customer buys → Gumroad POSTs to /api/ping → key generated from order ID → email sent via Gmail

---

The `clipboard-manager/` folder holds **GD Clipboard**, a separate desktop app
(not deployed to Vercel). See [clipboard-manager/README.md](clipboard-manager/README.md).
