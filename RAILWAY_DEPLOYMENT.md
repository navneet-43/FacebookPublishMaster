# 🚀 Railway Deployment Guide

## Step 1: Create Railway Account
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Connect your GitHub account

## Step 2: Deploy from GitHub
1. In Railway dashboard, click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Choose your **FacebookPublishMaster** repository
4. Railway will automatically detect the Node.js app

## Step 3: Set Environment Variables
In Railway dashboard, go to your project → **Variables** tab and add:

### Required Variables:
```
DATABASE_URL=postgresql://neondb_owner:npg_Dyw2CBhLvK7E@ep-polished-leaf-ah73odv0-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
SESSION_SECRET=facebook-publish-master-super-secret-key-2024
FACEBOOK_APP_ID=2513370545716290
FACEBOOK_APP_SECRET=e75a33395866cf359d67a251e3461056
```

### Optional Variables:
```
FACEBOOK_CALLBACK_URL=https://your-app.railway.app/auth/facebook/callback
```

## Step 4: Get Your Railway Domain
1. After deployment, Railway will provide a domain like: `https://your-app-name.railway.app`
2. Copy this domain URL

## Step 5: Update Facebook App Settings
1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Select your app (ID: 2513370545716290)
3. Go to **"Facebook Login"** → **"Settings"**
4. Add to **"Valid OAuth Redirect URIs"**:
   ```
   https://your-app-name.railway.app/auth/facebook/callback
   ```
5. **Save Changes**

## Step 6: Test Your Deployment
1. Visit your Railway domain: `https://your-app-name.railway.app`
2. Test Facebook login
3. Create and schedule posts
4. Import from Excel/CSV

## 🎉 Success!
Your Facebook Publish Master is now live on Railway with:
- ✅ HTTPS domain (Facebook OAuth compatible)
- ✅ Automatic deployments from GitHub
- ✅ Environment variables configured
- ✅ Database connected
- ✅ All services running

## 📱 Features Available:
- Facebook & Instagram posting
- Scheduled posts
- Excel/CSV import
- Analytics and reports
- Custom labels
- Google Sheets integration
