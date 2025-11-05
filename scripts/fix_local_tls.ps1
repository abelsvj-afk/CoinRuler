# fix_local_tls.ps1
# Guidance to resolve "unable to get local issuer certificate" on Windows/Node
# Run as Administrator when importing root CAs.

Write-Host "1) Try using system certificates by setting NODE_EXTRA_CA_CERTS to your CA bundle (if you have one)."
Write-Host "   Example (PowerShell): $env:NODE_EXTRA_CA_CERTS='C:\\path\\to\\cacert.pem' ; node yourscript.js"

Write-Host "2) If using corporate proxy / TLS interception, obtain the proxy's root CA and add it to Windows Certificate Store (Trusted Root Certification Authorities)."
Write-Host "   Use certmgr.msc or PowerShell: Import-Certificate -FilePath C:\\path\\to\\proxy-ca.crt -CertStoreLocation Cert:\\LocalMachine\\Root"

Write-Host "3) For a development workaround (NOT recommended in production), you can disable strict TLS in Node by setting NODE_TLS_REJECT_UNAUTHORIZED=0"
Write-Host "   Example (PowerShell, temporary): $env:NODE_TLS_REJECT_UNAUTHORIZED='0'; node scripts/fetch_coinbase_balances.js"

Write-Host "4) Prefer running live Coinbase fetch on Railway or other cloud host to avoid local TLS issues."

Write-Host "5) If issues persist, capture the error and consult your IT for TLS root CA installation."
