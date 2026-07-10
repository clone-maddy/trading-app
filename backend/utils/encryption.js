const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';

// Derive a secure 32-byte key from whatever string is in process.env.ENCRYPTION_KEY
const getEncryptionKey = () => {
  const secret = process.env.ENCRYPTION_KEY || 'chanakya_fallback_secure_key_2026';
  return crypto.createHash('sha256').update(secret).digest();
};

const encrypt = (text) => {
  if (!text) return '';
  try {
    const iv = crypto.randomBytes(16);
    const key = getEncryptionKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption failed:', error.message);
    return text;
  }
};

const decrypt = (text) => {
  if (!text) return '';
  // If not formatted as iv:ciphertext, return as is (to handle existing plaintext legacy entries)
  if (!text.includes(':')) return text;
  
  try {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption failed, returning input as-is:', error.message);
    return text;
  }
};

module.exports = { encrypt, decrypt };
