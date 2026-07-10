# Chanakya App Project Rules & Architecture Memory

## SaaS Platform Architecture for the Public
To make onboarding frictionless for public retail traders:
1. **Global Platform API Key**: The platform uses a single platform-wide developer SmartAPI Key stored as `ANGEL_API_KEY` in the backend `.env`. 
2. **No User-Specific API Keys**: Users are not required to provide their own developer API key. The "SmartAPI Key" input field is removed from the settings UI, and the User database model ignores/omits user-specific API keys.
3. **User Broker Details**: Users only need to configure their:
   - **Client ID** (Client Code)
   - **MPIN** (4-digit passcode)
   - **TOTP Secret Key** (Base32 key to automatically generate 6-digit TOTP codes for background logins)
4. **WebSocket Feed**: The WebSocket feed is shared and uses the global `ANGEL_API_KEY` to connect to AngelOne on behalf of active users.
