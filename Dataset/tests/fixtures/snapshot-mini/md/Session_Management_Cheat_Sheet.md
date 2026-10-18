# Session_Management_Cheat_Sheet

## Introduction
Web authentication, session management, and access control are tightly linked 🙂. A session is a sequence of network HTTP request and response transactions associated with the same user.

## Session ID Properties
The session ID must be long enough to prevent brute force attacks. The session ID length must be at least 128 bits (16 bytes). The session ID value must provide at least 64 bits of entropy. The session ID content must be meaningless to prevent information disclosure attacks.

## Cookies
The Secure cookie attribute instructs web browsers to only send the cookie through an encrypted HTTPS connection. The HttpOnly cookie attribute instructs web browsers not to allow scripts to access the cookies via the DOM document.cookie object. The SameSite attribute lets servers require that a cookie is not sent with cross-origin requests.