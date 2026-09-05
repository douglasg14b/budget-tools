param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Add', 'Remove')]
    [string] $Action
)

$ErrorActionPreference = 'Stop'
$ruleName = 'budget-tools-dev-lan-vite-5173'
$nodeRuleName = 'budget-tools-dev-lan-node'

function Remove-NamedRule([string] $name) {
    if (Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue) {
        Remove-NetFirewallRule -Name $name
        Write-Host "Removed $name."
    } elseif (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue) {
        Remove-NetFirewallRule -DisplayName $name
        Write-Host "Removed $name."
    }
}

if ($Action -eq 'Remove') {
    Remove-NamedRule $ruleName
    Remove-NamedRule $nodeRuleName
    Write-Host 'LAN firewall rules removed.'
    exit 0
}

Remove-NamedRule $nodeRuleName

if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
    Write-Host "Firewall rule $ruleName already exists."
    exit 0
}

New-NetFirewallRule `
    -DisplayName $ruleName `
    -Name $ruleName `
    -Description 'Temporary LAN access to Vite (pnpm dev). Remove with scripts/dev-lan-firewall.ps1 -Action Remove.' `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 5173 `
    -Action Allow `
    -Profile Any |
    Out-Null

Write-Host "Added $ruleName (inbound TCP 5173)."
