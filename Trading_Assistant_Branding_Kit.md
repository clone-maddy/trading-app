# Trading Assistant Branding Kit

This document tells an AI coding agent (such as Antigravity) exactly how
to integrate the branding assets.

## Required Assets

  ----------------------------------------------------------------------------------------------------------------
  File                   Purpose         Recommended Size              Location
  ---------------------- --------------- ----------------------------- -------------------------------------------
  favicon.ico            Browser tab     32x32                         `frontend/public/favicon.ico`
                         icon                                          

  favicon.png            PNG favicon     32x32                         `frontend/public/favicon.png`

  logo.png               Main            512x512 transparent           `frontend/src/assets/logo.png`
                         application                                   
                         logo                                          

  logo-horizontal.png    Navbar/header   \~1200x300 transparent        `frontend/src/assets/logo-horizontal.png`
                         logo                                          

  logo-email.png         Welcome email   600x180 transparent           Public URL
                         header                                        

  logo192.png            PWA icon        192x192                       `frontend/public/logo192.png`

  logo512.png            PWA icon        512x512                       `frontend/public/logo512.png`

  apple-touch-icon.png   iOS icon        180x180                       `frontend/public/apple-touch-icon.png`

  social-preview.png     Open Graph      1200x630                      `frontend/public/social-preview.png`
                         preview                                       
  ----------------------------------------------------------------------------------------------------------------

## React Integration

### Navbar

Import:

``` jsx
import logo from "../assets/logo-horizontal.png";
<img src={logo} alt="Trading Assistant" height={42} />
```

### Login Page

``` jsx
import logo from "../assets/logo.png";
<img src={logo} alt="Trading Assistant" width={180}/>
```

## Browser Favicon

`public/index.html`

``` html
<link rel="icon" href="%PUBLIC_URL%/favicon.ico" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

## Manifest

`public/manifest.json`

``` json
{
  "name":"Trading Assistant",
  "short_name":"Trading",
  "icons":[
    {
      "src":"logo192.png",
      "sizes":"192x192",
      "type":"image/png"
    },
    {
      "src":"logo512.png",
      "sizes":"512x512",
      "type":"image/png"
    }
  ]
}
```

## Open Graph

Add inside `<head>`:

``` html
<meta property="og:image" content="https://YOUR_DOMAIN/social-preview.png">
```

## Welcome Email

Use:

``` html
<img src="https://YOUR_DOMAIN/logo-email.png"
width="220"
alt="Trading Assistant">
```

Never reference local files inside emails.

## Folder Structure

    frontend/
    ├── public/
    │   ├── favicon.ico
    │   ├── favicon.png
    │   ├── logo192.png
    │   ├── logo512.png
    │   ├── apple-touch-icon.png
    │   ├── social-preview.png
    │   └── manifest.json
    └── src/
        └── assets/
            ├── logo.png
            ├── logo-horizontal.png
            └── logo-email.png

## Branding Notes

-   Use transparent PNGs.
-   Preserve aspect ratio.
-   Do not add backgrounds.
-   Use the horizontal logo in the navbar.
-   Use the square logo for login and loading screens.
-   Use favicon.ico for browser tabs.
-   Host the email logo publicly.
-   Prefer SVG versions whenever available.
