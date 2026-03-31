require('dotenv').config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function validateStartupEnv() {
  const required = ['JWT_SECRET', 'DATABASE_URL'];
  const optional = ['FRONTEND_URL', 'CLIENT_URLS', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'NEWSDATA_API_KEY'];

  const missingRequired = required.filter((name) => {
    const value = process.env[name];
    return !value || !String(value).trim();
  });

  if (missingRequired.length) {
    console.error('Startup configuration error.');
    missingRequired.forEach((name) => {
      console.error(`- Missing required environment variable: ${name}`);
    });
    console.error('Set these in your Render service Environment settings, then redeploy.');
    process.exit(1);
  }

  const missingOptional = optional.filter((name) => {
    const value = process.env[name];
    return !value || !String(value).trim();
  });

  if (missingOptional.length) {
    console.warn(`Optional environment variables not set: ${missingOptional.join(', ')}`);
  }
}

module.exports = { requireEnv, validateStartupEnv };
