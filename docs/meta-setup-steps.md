# Meta Developer App Setup — Couch Edition

You need: their laptop (logged into Facebook), your laptop (logged into Meta Business Suite)

---

## On Their Laptop

### 1. Create a Facebook Page
- Go to **facebook.com/pages/create**
- Name: **South Bay Signal**
- Category: search **Community**
- Click Create Page
- Skip any prompts to add cover photo / bio / etc

### 2. Add you as Page Admin
- On the new Page, click **Settings** (left sidebar or gear icon)
- Go to **Page access** or **Page Roles**
- Under "Add New Page Roles" → enter **stephen@southbaysignal.org**
- Set role to **Admin**
- They confirm with their Facebook password
- You'll get an invite — accept it from your side (Business Suite or email)

### 3. Create a Meta Developer App
- Go to **developers.facebook.com**
- Click **My Apps** → **Create App**
- App type: **Business**
- App name: **South Bay Signal**
- Contact email: **hello@southbaysignal.org**
- If asked for a Business Portfolio, skip or create one called "South Bay Signal"
- Click Create

### 4. Add you as App Developer
- In the app dashboard → **App Settings** → **App Roles** → **Roles**
- Click **Add People**
- Enter **stephen@southbaysignal.org** (or whatever email is tied to your Meta/IG login)
- Role: **Developer** or **Admin**
- They confirm

### 5. Add API Products
- In the app dashboard → left sidebar → **Add Products**
- Find **Threads API** → click **Set Up**
- Find **Facebook Login for Business** → click **Set Up** (needed for Page posting)
- Find **Instagram Graph API** → click **Set Up** (for future IG posting)

---

## On Your Laptop

### 7. Accept the Page invite
- Go to **business.facebook.com** or check email for the Page admin invite
- Accept it
- Confirm the South Bay Signal Page now shows up in your Meta Business Suite dropdown (top left, next to @stanwood.dev)

### 8. Accept the App Developer invite
- Go to **developers.facebook.com**
- You should see the "South Bay Signal" app in **My Apps**
- If not, check email for the developer invite and accept

### 9. Link Instagram to the Facebook Page
- In Meta Business Suite → **Settings** → **Accounts** → **Instagram accounts**
- Connect **@southbaysignal** to the **South Bay Signal** Page
- (You may have already done this during the professional account conversion — check if it's already linked)

### 10. Generate API Tokens

**Threads:**
- In developers.facebook.com → South Bay Signal app
- Go to **Threads API** → **Settings** or **Tools**
- Generate a long-lived access token
- Copy the **access token** and your **Threads user ID**

**Facebook Page:**
- In the app dashboard → **Tools** → **Graph API Explorer**
- Select the **South Bay Signal** Page from the dropdown
- Request permissions: `pages_manage_posts`, `pages_read_engagement`
- Generate a **Page Access Token** (not a User token)
- Extend it to a long-lived token
- Copy the **Page Access Token** and **Page ID**

### 11. Save credentials
On your MacBook, add to `.env.local`:
```
THREADS_ACCESS_TOKEN=<the token>
THREADS_USER_ID=<your threads user id>
FB_PAGE_ACCESS_TOKEN=<the page token>
FB_PAGE_ID=<the page id>
```

Then copy to Mac Mini:
```bash
ssh 10.0.0.234
# Add same vars to the project's .env.local
```

---

## Done

Their laptop is no longer needed. Everything from here is managed through:
- **Meta Business Suite** (business.facebook.com) — Page management, IG, inbox
- **developers.facebook.com** — API tokens, app settings
- **Your code** — publish.mjs handles the rest
