# wstg-v4.2

Table of Contents
4.6 Session Management Testing
4.6.1 Testing for Session Management Schema
4.6.2 Testing for Cookies Attributes

Foreword by Eoin Keary
The problem of insecure software is perhaps the most important technical challenge of our time, and security testing is part of a wider approach to build a secure system.

## WSTG-SESS-01 Testing for Session Management Schema
Summary
In order to avoid continuous authentication for each page of a website or service, web applications implement various mechanisms to store and validate credentials for a pre-determined timespan. These mechanisms are known as Session Management.
Test Objectives
Gather session tokens, for the same user and for different users where possible. Analyze and ensure that enough randomness exists to stop session forging attacks.

## WSTG-SESS-02 Testing for Cookies Attributes
Summary
Web cookies are a mechanism used by servers to keep state across requests. Testers should check that the Secure, HttpOnly and SameSite attributes are set on session cookies.

## WSTG-SESS-09 Testing for Session Variable Overloading
This content has been merged into: Testing for Session Management Schema.

Reporting
Performing the technical side of the assessment is only half of the overall assessment process.
About this Section
This guide provides only suggestions about one possible approach to reporting, and should not be treated as strict rules.
Appendix
Appendix A. Testing Tools Resource
Appendix B. Suggested Reading
Appendix C. Fuzz Vectors
Appendix D. Encoded Injection
Appendix E. History
Appendix F. Leveraging Dev Tools
Testing Tools Resource
ZAP is an easy to use integrated penetration testing tool for finding vulnerabilities in web applications.
Suggested Reading
The Web Application Hacker's Handbook.
Fuzz Vectors
' OR 1=1 -- and other payloads listed one per line for fuzzing input fields.
Encoded Injection
%3Cscript%3Ealert(1)%3C/script%3E is the URL encoded form of a script tag.
History
The Testing Guide v4 was released in 2014 after the v3 release in 2008.
Leveraging Dev Tools
Opening Dev Tools can be accomplished in a number of ways, such as pressing F12 in most browsers.