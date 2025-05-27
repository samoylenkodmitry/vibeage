#!/bin/bash
# Ubuntu VPS Security Hardening Script
# Run as root: sudo bash harden-vps.sh

set -e

echo "=== Ubuntu VPS Security Hardening ==="

# 1. Update system
echo "1. Updating system packages..."
apt update && apt upgrade -y

# 2. Install essential security tools
echo "2. Installing security tools..."
apt install -y ufw fail2ban unattended-upgrades rkhunter chkrootkit htop

# 3. Configure firewall (UFW)
echo "3. Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw --force enable

# 4. Configure fail2ban
echo "4. Configuring fail2ban..."
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3
backend = systemd

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
port = http,https
logpath = /var/log/nginx/error.log
EOF

systemctl enable fail2ban
systemctl restart fail2ban

# 5. Configure automatic security updates
echo "5. Configuring automatic security updates..."
cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF

cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

# 6. Disable unused services
echo "6. Disabling unused services..."
systemctl disable --now avahi-daemon 2>/dev/null || true
systemctl disable --now cups 2>/dev/null || true
systemctl disable --now bluetooth 2>/dev/null || true

# 7. Set up log monitoring
echo "7. Setting up log monitoring..."
cat > /etc/logrotate.d/vibeage << 'EOF'
/var/log/vibeage/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 root root
}
EOF

# 8. Configure system limits
echo "8. Configuring system limits..."
cat >> /etc/security/limits.conf << 'EOF'
* soft nofile 65536
* hard nofile 65536
* soft nproc 32768
* hard nproc 32768
EOF

# 9. Install and configure ClamAV (optional)
echo "9. Installing ClamAV antivirus..."
apt install -y clamav clamav-daemon
systemctl stop clamav-freshclam
freshclam
systemctl start clamav-freshclam
systemctl enable clamav-freshclam

echo "=== Hardening Complete ==="
echo "SSH configuration was not modified (already hardened)"
echo ""
echo "Security improvements applied:"
echo "1. System packages updated"
echo "2. Firewall (UFW) configured and enabled"
echo "3. Fail2ban configured for intrusion prevention"
echo "4. Automatic security updates enabled"
echo "5. Unused services disabled"
echo "6. Log rotation configured"
echo "7. System limits optimized"
echo "8. ClamAV antivirus installed"
echo ""
echo "Your database access commands:"
echo "- View DB logs: docker compose logs db"
echo "- Access DB: docker compose exec db psql -U postgres -d postgres"
echo "- View tables: docker compose exec db psql -U postgres -d postgres -c '\dt'"
echo ""
echo "Security monitoring:"
echo "- Check fail2ban status: fail2ban-client status"
echo "- Review firewall rules: ufw status verbose"
echo "- Run antivirus scan: clamscan -r /home"
