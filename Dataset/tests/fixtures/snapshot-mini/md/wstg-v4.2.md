# wstg-v4.2

Table of Contents
4.6 Session Management Testing
4.6.1 Testing for Session Management Schema
4.6.2 Testing for Cookies Attributes

## WSTG-SESS-01 Testing for Session Management Schema
Summary
In order to avoid continuous authentication for each page of a website or service, web applications implement various mechanisms to store and validate credentials for a pre-determined timespan. These mechanisms are known as Session Management.
Test Objectives
Gather session tokens, for the same user and for different users where possible. Analyze and ensure that enough randomness exists to stop session forging attacks.

## WSTG-SESS-02 Testing for Cookies Attributes
Summary
Web cookies are a mechanism used by servers to keep state across requests. Testers should check that the Secure, HttpOnly and SameSite attributes are set on session cookies.