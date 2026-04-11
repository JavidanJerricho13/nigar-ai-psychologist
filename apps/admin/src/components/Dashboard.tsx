import React, { useState, useEffect } from 'react';
import { Box, H2, H4, Text, MessageBox } from '@adminjs/design-system';

interface KpiData {
  totalUsers: number;
  dau: number;
  mau: number;
  stickiness: number;
  revenue: number;
  arpu: number;
  onboardingRate: number;
  payingRatio: number;
  newUsersToday: number;
  avgMessagesPerSession: number;
}

interface SafetyData {
  totalCrises: number;
  unhandled: number;
  activeConversations: number;
}

interface TokenData {
  totalTokens: number;
  byProvider: Array<{ provider: string; tokens: number; messages: number }>;
}

const KpiCard = ({ label, value, icon }: { label: string; value: string | number; icon: string }) => (
  <Box
    flex flexDirection="column" alignItems="center" justifyContent="center"
    bg="white" p="xl" mr="lg" mb="lg"
    style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', minWidth: 180 }}
  >
    <Text fontSize={28}>{icon}</Text>
    <H4 mt="sm" mb="xs">{String(value)}</H4>
    <Text fontSize="sm" color="grey60">{label}</Text>
  </Box>
);

const Dashboard = () => {
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [safety, setSafety] = useState<SafetyData | null>(null);
  const [tokens, setTokens] = useState<TokenData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/admin/api/metrics/kpi').then((r) => r.json()),
      fetch('/admin/api/metrics/safety').then((r) => r.json()),
      fetch('/admin/api/metrics/providers').then((r) => r.json()),
    ])
      .then(([k, s, t]) => { setKpi(k); setSafety(s); setTokens(t); })
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <MessageBox variant="danger" message={`Error: ${error}`} />;
  if (!kpi) return <Text>Loading metrics...</Text>;

  return (
    <Box p="xxl">
      <H2 mb="xl">📊 Nigar AI Dashboard</H2>

      {/* Crisis Alert */}
      {safety && safety.unhandled > 0 && (
        <MessageBox
          variant="danger"
          message={`🆘 ${safety.unhandled} unhandled crisis event(s)! Check Safety → CrisisEvents.`}
          mb="xl"
        />
      )}

      {/* KPI Cards Row 1 */}
      <Box flex flexWrap="wrap" mb="xl">
        <KpiCard icon="👥" label="Total Users" value={kpi.totalUsers} />
        <KpiCard icon="📈" label="DAU" value={kpi.dau} />
        <KpiCard icon="📊" label="MAU" value={kpi.mau} />
        <KpiCard icon="🔄" label="Stickiness" value={`${kpi.stickiness}%`} />
      </Box>

      {/* KPI Cards Row 2 */}
      <Box flex flexWrap="wrap" mb="xl">
        <KpiCard icon="💰" label="Revenue" value={`${kpi.revenue} AZN`} />
        <KpiCard icon="💳" label="ARPU" value={`${kpi.arpu} AZN`} />
        <KpiCard icon="✅" label="Onboarding Rate" value={`${kpi.onboardingRate}%`} />
        <KpiCard icon="💎" label="Paying Ratio" value={`${kpi.payingRatio}%`} />
      </Box>

      {/* KPI Cards Row 3 */}
      <Box flex flexWrap="wrap" mb="xl">
        <KpiCard icon="🆕" label="New Today" value={kpi.newUsersToday} />
        <KpiCard icon="💬" label="Avg Msgs/Session" value={kpi.avgMessagesPerSession} />
        <KpiCard icon="🔥" label="Active Convos" value={safety?.activeConversations ?? 0} />
        <KpiCard icon="🧠" label="Total Tokens" value={(tokens?.totalTokens ?? 0).toLocaleString()} />
      </Box>

      {/* Provider Stats */}
      {tokens && tokens.byProvider.length > 0 && (
        <Box bg="white" p="xl" mb="xl" style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <H4 mb="lg">🤖 LLM Provider Usage</H4>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: 8 }}>Provider</th>
                <th style={{ textAlign: 'right', padding: 8 }}>Tokens</th>
                <th style={{ textAlign: 'right', padding: 8 }}>Messages</th>
              </tr>
            </thead>
            <tbody>
              {tokens.byProvider.map((p) => (
                <tr key={p.provider} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: 8, fontWeight: 600 }}>{p.provider}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{p.tokens.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{p.messages}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      )}

      {/* Quick Links */}
      <Box bg="white" p="xl" style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <H4 mb="md">📋 API Endpoints</H4>
        <Text fontSize="sm" color="grey80">
          <a href="/admin/api/metrics">/admin/api/metrics</a> — All metrics<br />
          <a href="/admin/api/metrics/kpi">/admin/api/metrics/kpi</a> — KPI summary<br />
          <a href="/admin/api/metrics/revenue">/admin/api/metrics/revenue</a> — Revenue chart data<br />
          <a href="/admin/api/metrics/retention">/admin/api/metrics/retention</a> — Retention cohorts<br />
          <a href="/admin/api/metrics/personas">/admin/api/metrics/personas</a> — Persona distribution<br />
          <a href="/admin/api/metrics/safety">/admin/api/metrics/safety</a> — Crisis events<br />
        </Text>
      </Box>
    </Box>
  );
};

export default Dashboard;
