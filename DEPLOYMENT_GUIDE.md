# Summarize This - Deployment Guide

> Historical note: this guide reflects an earlier deployment plan and should not be treated as the current source of truth for shipped scope or production readiness. Use the audit and verification documents under `docs/` for the current verified state.

Complete guide for deploying the Summarize This Trello Power-Up to production.

## Prerequisites

### Required
- HTTPS web hosting (Trello requires HTTPS for Power-Ups)
- Domain name or subdomain
- Trello account with Power-Up creation permissions

### Recommended
- CDN for faster global delivery
- SSL certificate (Let's Encrypt or commercial)
- GitHub account for version control

## Deployment Options

### Option 1: Static Hosting (Recommended for MVP)

**Suitable for:** Netlify, Vercel, GitHub Pages, AWS S3 + CloudFront

**Advantages:**
- Simple deployment
- Free or low-cost
- Automatic HTTPS
- CDN included
- Easy updates

**Steps:**

1. **Choose hosting provider**
   - Netlify (recommended for beginners)
   - Vercel (recommended for developers)
   - GitHub Pages (free, but limited)
   - AWS S3 + CloudFront (enterprise-grade)

2. **Prepare files**
   ```bash
   # Ensure all files are in the deployment directory
   ls -la summarize-this-v2/
   ```

3. **Verify manifest.json**
   ```json
   {
     "name": "Summarize This",
     "details": "AI-assisted Trello card summarization with a local fallback summary when no AI provider is configured.",
     "icon": {
       "url": "./icon.svg"
     },
     "author": "Your Name",
     "capabilities": [
       "card-buttons",
       "card-detail-badges",
       "show-settings",
       "authorization-status",
       "show-authorization"
     ],
     "connectors": {
       "iframe": {
         "url": "./connector.html"
       }
     }
   }
   ```

4. **Deploy to hosting**

   **Netlify:**
   ```bash
   # Install Netlify CLI
   npm install -g netlify-cli
   
   # Deploy
   cd summarize-this-v2
   netlify deploy --prod
   ```

   **Vercel:**
   ```bash
   # Install Vercel CLI
   npm install -g vercel
   
   # Deploy
   cd summarize-this-v2
   vercel --prod
   ```

   **GitHub Pages:**
   ```bash
   # Push to GitHub
   git init
   git add .
   git commit -m "Initial deployment"
   git branch -M gh-pages
   git remote add origin https://github.com/username/repo.git
   git push -u origin gh-pages
   ```

### Option 2: Traditional Web Server

**Suitable for:** Apache, Nginx, IIS

**Steps:**

1. **Upload files via FTP/SFTP**
   ```bash
   # Using rsync
   rsync -avz summarize-this-v2/ user@server:/var/www/html/summarize-this/
   ```

2. **Configure web server**

   **Nginx:**
   ```nginx
   server {
       listen 443 ssl http2;
       server_name summarize-this.yourdomain.com;
       
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;
       
       root /var/www/html/summarize-this;
       index index.html;
       
       location / {
           try_files $uri $uri/ =404;
       }
       
   }
   ```

   **Apache:**
   ```apache
   <VirtualHost *:443>
       ServerName summarize-this.yourdomain.com
       DocumentRoot /var/www/html/summarize-this
       
       SSLEngine on
       SSLCertificateFile /path/to/cert.pem
       SSLCertificateKeyFile /path/to/key.pem
       
       <Directory /var/www/html/summarize-this>
           Options Indexes FollowSymLinks
           AllowOverride All
           Require all granted
       </Directory>
       
       # CORS headers
       Header set Access-Control-Allow-Origin "https://trello.com"
       Header set Access-Control-Allow-Methods "GET, POST, OPTIONS"
   </VirtualHost>
   ```

3. **Restart web server**
   ```bash
   # Nginx
   sudo systemctl restart nginx
   
   # Apache
   sudo systemctl restart apache2
   ```

## Trello Power-Up Configuration

### 1. Create Power-Up

1. Go to https://trello.com/power-ups/admin
2. Click "Create New Power-Up"
3. Fill in details:
   - **Name:** Summarize This
   - **Workspace:** Select your workspace
   - **Iframe connector URL:** https://your-domain.com/connector.html
   - **Description:** AI-powered card analysis with multiple AI providers
   - **Support contact:** your-email@example.com

### 2. Configure Capabilities

Enable the following capabilities:
- ✅ Card Buttons
- ✅ Card Detail Badges
- ✅ Show Settings
- ✅ Authorization Status
- ✅ Show Authorization

### 3. Add Icon and Images

Upload:
- Icon (200x200px PNG)
- Cover image (1280x720px PNG)
- Screenshots (optional)

### 4. Test Installation

1. Go to any Trello board
2. Click "Power-Ups" → "Custom"
3. Enter your Power-Up URL
4. Click "Add"
5. Test functionality

## Environment Configuration

### API Keys Setup

Users will need to enter their own API keys. Provide clear instructions:

1. **OpenAI:** https://platform.openai.com/api-keys
2. **Anthropic:** https://console.anthropic.com/settings/keys
3. **Google AI:** https://makersuite.google.com/app/apikey
4. **Cohere:** https://dashboard.cohere.com/api-keys
5. **Perplexity:** https://www.perplexity.ai/settings/api

### Security Considerations

**DO:**
- ✅ Use HTTPS only
- ✅ Store API keys in localStorage (client-side only)
- ✅ Validate all inputs
- ✅ Implement rate limiting
- ✅ Use Content Security Policy headers

**DON'T:**
- ❌ Store API keys on server
- ❌ Expose API keys in code
- ❌ Allow HTTP connections
- ❌ Trust client input without validation

## Performance Optimization

### 1. Enable Compression

**Nginx:**
```nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
```

**Apache:**
```apache
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/html text/plain text/css application/json application/javascript
</IfModule>
```

### 2. Set Cache Headers

```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### 3. Use CDN

Configure CDN for:
- JavaScript libraries (PDF.js, mammoth.js, xlsx.js, Tesseract.js)
- Static assets (images, fonts)
- Application files (optional)

## Monitoring and Analytics

### 1. Error Tracking

Add error tracking service (optional):
- Sentry
- Rollbar
- LogRocket

### 2. Usage Analytics

Track:
- Number of analyses
- Most used strategies
- Average cost per analysis
- User retention

### 3. Performance Monitoring

Monitor:
- Page load time
- API response times
- Error rates
- User engagement

## Maintenance

### Regular Tasks

**Weekly:**
- Check error logs
- Monitor usage statistics
- Review user feedback

**Monthly:**
- Update dependencies
- Review security advisories
- Optimize performance
- Backup user data (if applicable)

**Quarterly:**
- Major feature updates
- Security audits
- Performance reviews
- User surveys

### Update Procedure

1. **Test locally**
   ```bash
   # Test all changes
   npm test
   ```

2. **Deploy to staging**
   ```bash
   # Deploy to test environment
   netlify deploy
   ```

3. **Test in staging**
   - Run automated tests
   - Manual testing
   - User acceptance testing

4. **Deploy to production**
   ```bash
   # Deploy to production
   netlify deploy --prod
   ```

5. **Monitor deployment**
   - Check error logs
   - Monitor performance
   - Verify functionality

## Troubleshooting

### Common Issues

**Issue:** Power-Up not loading
- **Solution:** Check HTTPS configuration, verify CORS headers, check browser console for errors

**Issue:** API calls failing
- **Solution:** Verify API keys, check network tab, ensure proper error handling

**Issue:** Slow performance
- **Solution:** Enable compression, use CDN, optimize images, minimize JavaScript

**Issue:** CORS errors
- **Solution:** Add proper CORS headers, verify allowed origins, check Trello Power-Up settings

## Scaling Considerations

### For High Traffic

1. **Use CDN**
   - CloudFlare
   - AWS CloudFront
   - Fastly

2. **Implement caching**
   - Browser caching
   - Service worker
   - API response caching

3. **Optimize assets**
   - Minify JavaScript/CSS
   - Compress images
   - Lazy load resources

4. **Monitor performance**
   - Real User Monitoring (RUM)
   - Synthetic monitoring
   - Performance budgets

## Cost Management

### Hosting Costs

**Free Tier Options:**
- Netlify: 100GB bandwidth/month
- Vercel: 100GB bandwidth/month
- GitHub Pages: 100GB bandwidth/month

**Paid Options:**
- Netlify Pro: $19/month
- Vercel Pro: $20/month
- AWS S3 + CloudFront: ~$5-50/month (usage-based)

### AI API Costs

**Per Analysis (estimated):**
- Best Quality: ~$0.05
- Cost-Effective: ~$0.01
- Speed-Optimized: ~$0.005
- Comprehensive: ~$0.10
- Privacy-Focused: Free

**Monthly Budget Examples:**
- Light use (10 analyses/day): ~$3-15/month
- Medium use (50 analyses/day): ~$15-75/month
- Heavy use (200 analyses/day): ~$60-300/month

## Support and Documentation

### User Documentation

Create:
- Quick start guide
- Video tutorials
- FAQ section
- Troubleshooting guide

### Developer Documentation

Maintain:
- API documentation
- Code comments
- Architecture diagrams
- Deployment procedures

## Legal and Compliance

### Privacy Policy

Include:
- Data collection practices
- API key storage
- Third-party services
- User rights

### Terms of Service

Define:
- Acceptable use
- Limitations of liability
- Service availability
- User responsibilities

### Compliance

Ensure:
- GDPR compliance (if applicable)
- CCPA compliance (if applicable)
- API provider terms of service
- Trello Power-Up guidelines

## Next Steps

1. ✅ Choose hosting provider
2. ✅ Deploy application
3. ✅ Create Trello Power-Up
4. ✅ Test thoroughly
5. ✅ Create documentation
6. ✅ Launch to users
7. ✅ Monitor and iterate

## Resources

- [Trello Power-Up Documentation](https://developer.atlassian.com/cloud/trello/power-ups/)
- [Netlify Documentation](https://docs.netlify.com/)
- [Vercel Documentation](https://vercel.com/docs)
- [Let's Encrypt](https://letsencrypt.org/)
- [MDN Web Docs](https://developer.mozilla.org/)

---

**Need help?** Contact support or check the troubleshooting section.
