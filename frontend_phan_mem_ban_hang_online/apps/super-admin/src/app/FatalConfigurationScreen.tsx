export interface FatalConfigurationScreenProps {
  error: string;
}

export function FatalConfigurationScreen({ error }: FatalConfigurationScreenProps) {
  return (
    <div style={{ padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <h1>Không thể khởi động ứng dụng</h1>
      <p>Cấu hình runtime không hợp lệ. Vui lòng liên hệ quản trị viên.</p>
      <pre style={{ whiteSpace: "pre-wrap", color: "#991B1B" }}>{error}</pre>
    </div>
  );
}
