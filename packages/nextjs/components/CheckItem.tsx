export default function CheckItem({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className={`text-lg ${passed ? "text-success" : "text-error"}`}>
        {passed ? "✅" : "❌"}
      </span>
      <span className="text-sm">{label}</span>
    </div>
  );
}
