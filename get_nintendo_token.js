import readline from 'readline';
import crypto from 'crypto';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Generate PKCE Verifier
const verifier = crypto.randomBytes(32).toString('base64url');

// Generate PKCE Challenge
const challenge = crypto.createHash('sha256')
    .update(verifier)
    .digest()
    .toString('base64url');

const state = crypto.randomBytes(32).toString('base64url');

const authUrl = `https://accounts.nintendo.com/connect/1.0.0/authorize?state=${state}&redirect_uri=npf54789befb391a838%3A%2F%2Fauth&client_id=54789befb391a838&scope=openid+user+user.mii+moonUser%3Aadministration+moonDevice%3Acreate+moonOwnedDevice%3Aadministration+moonParentalControlSetting+moonParentalControlSetting%3Aupdate+moonParentalControlSettingState+moonPairingState+moonSmartDevice%3Aadministration+moonDailySummary+moonMonthlySummary&response_type=session_token_code&session_token_code_challenge=${challenge}&session_token_code_challenge_method=S256&theme=login_form`;

console.log('1. Open this URL in your browser and log in:');
console.log(`\x1b[36m${authUrl}\x1b[0m`);
console.log('\n2. After logging in, right-click "Select this person" and copy the link.');

rl.question('\n3. Paste that "npf54789..." link here: ', async (link) => {
    try {
        const url = new URL(link.trim().replace('#', '?'));
        const code = url.searchParams.get('session_token_code');
        
        if (!code) {
          throw new Error('Could not find session_token_code in the link provided.');
        }

        console.log('\nExchanging code with Nintendo...');
        
        const response = await fetch('https://accounts.nintendo.com/connect/1.0.0/api/session_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'GamingLibraryDashboard/1.0.0',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                client_id: '54789befb391a838',
                session_token_code: code,
                session_token_code_verifier: verifier,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`Nintendo API error: ${data.error_description || data.error || response.statusText}`);
        }
        
        console.log('\n\x1b[32m--- SUCCESS: YOUR SESSION TOKEN ---\x1b[0m');
        console.log(data.session_token);
        console.log('\x1b[32m-----------------------------------\x1b[0m');
        console.log('\nCopy the long string above into your .env file as:');
        console.log('NINTENDO_SESSION_TOKEN="' + data.session_token + '"');
    } catch (e) {
        console.error('\n\x1b[31mFAILED:\x1b[0m', e.message);
        if (e.message.includes('invalid_request')) {
          console.log('Hint: The link might have expired or was already used. Ensure you are using the NEW URL printed above.');
        }
    }
    rl.close();
});
