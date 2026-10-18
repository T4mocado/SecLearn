# Security_Terminology_Cheat_Sheet

## Security Terminology Cheat Sheet
## Introduction
This cheat sheet provides clear definitions and distinctions for security terminology that is often confused, even
by experienced developers. Understanding these terms is critical for correctly implementing security controls and
following standards like the OWASP ASVS.
## Table of Contents
Data Handling: Encoding, Escaping, Sanitization, and Serialization
Cryptography: Encryption, Hashing, and Signatures
Identity: Authentication and Authorization
Federated Identity Terms
References
## Data Handling: Encoding, Escaping, Sanitization, and Serialization
These terms relate to how data is transformed for transport, storage, or display. See the Input Validation Cheat
Sheet for validation guidance.
## Encoding
Definition: Transforming data into a different format using a publicly available scheme, so that it can be safely
consumed by a different system.
Purpose: Represent data for a particular transport, storage, or output context.
Reversibility: Always reversible.
Examples: Base64, URL Encoding, HTML Entity Encoding.
Security Context: Base64 does not provide confidentiality. Context-appropriate output encoding is an
XSS defense; using the wrong encoding for the destination context can leave an injection vulnerability.
## Escaping
Definition: Representing characters with parser-specific escape sequences so they are interpreted literally in a
particular context.

Purpose: To ensure the interpreter treats the data as text rather than code/commands.
Examples: \" inside a JSON string, &lt; in HTML text.
Security Context: Escaping rules depend on the parser and context. For SQL values, use parameterized
queries instead of constructing SQL with escaped strings.
## Sanitization
Definition: The process of cleaning or filtering input by removing, replacing, or modifying potentially
dangerous characters or content.
Purpose: To make "dirty" input "clean" according to a security policy.
Examples: Using a maintained HTML sanitizer to allow approved elements and attributes in user-
authored HTML.
Security Context: Use HTML sanitization when untrusted input must be rendered as HTML. Removing
<script> tags alone is insufficient; other elements and attributes can execute scripts. Use output encoding
when the value should be displayed as text.
## Serialization
Definition: Converting an object or data structure into a format that can be stored or transmitted (e.g., a byte
stream) and later reconstructed.
Purpose: Data persistence and communication.
Security Context: Insecure Deserialization occurs when untrusted data is used to reconstruct an object,
potentially leading to Remote Code Execution (RCE).
## Cryptography: Encryption, Hashing, and Signatures
These terms relate to protecting the confidentiality, integrity, and authenticity of data. See the Key Management
Cheat Sheet and Password Storage Cheat Sheet for implementation guidance.
## Encryption
Definition: Transforming data (plaintext) into an unreadable format (ciphertext) using a secret key.
Purpose: Confidentiality. Only authorized parties with the key can read the data.
Reversibility: Reversible (Decryption) with the correct key.
Types: Symmetric (same key) and Asymmetric (public/private keys).
## Hashing
Definition: Transforming data into a fixed-size string (a "hash" or "digest") using a mathematical function.
Purpose: Integrity. A small change in the input results in a completely different hash.
Reversibility: One-way (non-reversible).
Security Context: Used for password storage (with salt) and verifying file integrity.
Examples: SHA-256, Argon2, bcrypt.
## Signatures (Digital Signatures)
Definition: Using asymmetric cryptography to provide proof of the origin and integrity of a message.

Purpose: Authenticity and Non-repudiation. Proves who sent the message and that it wasn't altered.
Mechanism: The signing algorithm uses the signer's private key; verification uses a trusted public key
bound to that signer. Follow the algorithm's message-processing rules; do not add a separate prehash
unless the chosen algorithm and API require it.
Examples: Asymmetrically signed JWTs and GPG signatures. JWTs can also use shared-key message
authentication codes or encryption; the JWT format does not imply a digital signature.
## Identity: Authentication and Authorization
## Authentication (AuthN)
Definition: The process of verifying who a user is.
Question: "Who are you?"
Factors: Something you know (password), something you have (token), something you are (biometrics).
## Authorization (AuthZ)
Definition: The process of verifying what a user has permission to do.
Question: "Are you allowed to do this?"
Security Context: Occurs after successful authentication.
Examples: Role-Based Access Control (RBAC), Attribute-Based Access Control (ABAC).
## Federated Identity Terms
When working with OAuth2, SAML, or OIDC, these terms are frequently used:
Term 	Definition 	Context
Identity
Provider (IdP)
The system that creates, maintains, and manages identity
information and provides authentication services. Google, Okta, Azure AD
Relying Party
(RP)
An application or service that relies on an IdP to authenticate
users.
Your web app using
"Login with Google"
Service Provider
(SP) In SAML, the equivalent of a Relying Party. Your enterprise app using
SAML
Principal 	The entity (user, service, or device) being authenticated. 	The user logging in
## References
RFC 4949: Internet Security Glossary, Version 2
OpenID Connect Core 1.0: Terminology