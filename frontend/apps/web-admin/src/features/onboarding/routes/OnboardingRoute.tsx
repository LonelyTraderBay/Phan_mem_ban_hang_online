import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Button,
  Card,
  ContentArea,
  FormField,
  Input,
  PageHeader,
} from "@ai-sales/ui";

type OnboardingStep = "workspace" | "channel" | "product" | "done";

const STEPS: { id: OnboardingStep; label: string }[] = [
  { id: "workspace", label: "Không gian làm việc" },
  { id: "channel", label: "Kênh bán hàng" },
  { id: "product", label: "Sản phẩm" },
  { id: "done", label: "Hoàn tất" },
];

export default function OnboardingRoute() {
  const navigate = useNavigate();
  const [step, setStep] = useState<OnboardingStep>("workspace");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  function goNext() {
    if (step === "workspace") {
      const trimmed = workspaceName.trim();
      if (trimmed.length < 1 || trimmed.length > 120) {
        setWorkspaceError("Nhập tên không gian làm việc.");
        return;
      }
      setWorkspaceError(null);
      setStep("channel");
      return;
    }
    if (step === "channel") {
      setStep("product");
      return;
    }
    if (step === "product") {
      setStep("done");
      return;
    }
    navigate("/", { replace: true });
  }

  function skipInvite() {
    if (step === "channel") setStep("product");
    else if (step === "product") setStep("done");
    else goNext();
  }

  return (
    <ContentArea>
      <PageHeader
        title="Thiết lập không gian làm việc"
        description="Hoàn tất các bước cơ bản trước khi vận hành."
      />
      <nav aria-label="Tiến trình thiết lập" style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {STEPS.map((s, i) => (
          <span
            key={s.id}
            style={{
              fontSize: "0.875rem",
              fontWeight: i === stepIndex ? 600 : 400,
              opacity: i <= stepIndex ? 1 : 0.5,
            }}
          >
            {i + 1}. {s.label}
          </span>
        ))}
      </nav>
      {step === "workspace" ? (
        <Card>
          <FormField label="Tên không gian làm việc" {...(workspaceError ? { error: workspaceError } : {})}>
            <Input
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="Ví dụ: Shop thời trang ABC"
              maxLength={120}
              autoFocus
            />
          </FormField>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
            <Button onClick={() => void goNext()}>Tiếp tục</Button>
          </div>
        </Card>
      ) : null}
      {step === "channel" ? (
        <Card>
          <p style={{ marginTop: 0 }}>Kết nối kênh bán hàng đầu tiên (Facebook, Zalo, v.v.).</p>
          <p style={{ color: "var(--color-text-secondary, #666)", fontSize: "0.875rem" }}>
            Bước này chỉ là giao diện — chưa gọi API kết nối kênh.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
            <Button onClick={() => void goNext()}>Tiếp tục</Button>
            <Button variant="secondary" onClick={() => skipInvite()}>
              Bỏ qua
            </Button>
          </div>
        </Card>
      ) : null}
      {step === "product" ? (
        <Card>
          <p style={{ marginTop: 0 }}>Thêm sản phẩm đầu tiên hoặc nhập từ file.</p>
          <p style={{ color: "var(--color-text-secondary, #666)", fontSize: "0.875rem" }}>
            Bước này chỉ là giao diện — chưa gọi API danh mục.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
            <Button onClick={() => void goNext()}>Tiếp tục</Button>
            <Button variant="secondary" onClick={() => skipInvite()}>
              Bỏ qua
            </Button>
          </div>
        </Card>
      ) : null}
      {step === "done" ? (
        <Card>
          <p style={{ marginTop: 0 }}>Thiết lập cơ bản đã hoàn tất.</p>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
            <Button onClick={() => navigate("/", { replace: true })}>Đi tới bảng điều khiển</Button>
          </div>
        </Card>
      ) : null}
    </ContentArea>
  );
}
