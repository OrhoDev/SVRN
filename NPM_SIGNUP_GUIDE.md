# NPM Signup & Publishing Guide

## Step 1: Create NPM Account

1. Go to https://www.npmjs.com/signup
2. Fill out the form:
   - Username (this will be your package scope)
   - Email address
   - Password
3. Verify your email
4. Complete 2FA setup (recommended for security)

## Step 2: Login via Terminal

```bash
cd /home/dev0/SVRN/sdk
npm login
```

You'll be prompted for:
- Username
- Password
- Email
- OTP (if 2FA enabled)

## Step 3: Verify Login

```bash
npm whoami
```

Should show your username.

## Step 4: Publish Package

```bash
cd /home/dev0/SVRN/sdk
npm publish --access public
```

## Step 5: Verify Publication

Check https://www.npmjs.com/package/solvrn-sdk

## Troubleshooting

### "Package name already taken"
- Change name in `package.json` or use scoped package: `@yourusername/solvrn-sdk`

### "Need to verify email"
- Check your email and click verification link

### "2FA required"
- Enable 2FA in npm account settings
- Use OTP when prompted during `npm login`

### "Insufficient permissions"
- Make sure you're logged in: `npm whoami`
- Check package name isn't already taken by someone else

