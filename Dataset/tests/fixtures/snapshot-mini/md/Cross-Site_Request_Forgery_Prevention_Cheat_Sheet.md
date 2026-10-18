# Cross-Site_Request_Forgery_Prevention_Cheat_Sheet

## Introduction
A Cross-Site Request Forgery attack occurs when a malicious web site causes a user's web browser to perform an unwanted action on a trusted site when the user is authenticated.

## Token Based Mitigation
The synchronizer token pattern is one of the most popular and recommended methods to mitigate CSRF. CSRF tokens should be generated on the server side and they should be generated only once per user session or each request.

## References
OWASP CSRF page. CWE-352 entry.