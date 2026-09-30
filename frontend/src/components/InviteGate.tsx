import { useState, type FormEvent } from "react";
import { LuKeyRound } from "react-icons/lu";
import { Link } from "react-router-dom";
import { useI18n, type TKey } from "../i18n";
import { ApiRequestError, storeCode, verifyAccessCode } from "../lib/api";
import { btn, label } from "./ui";

/** Asks for the invite phrase before store creation. The API is what enforces it; this only collects it. */
export function InviteGate({ onUnlocked }: { onUnlocked: () => void }) {
  const { t } = useI18n();
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TKey | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const code = phrase.trim();
    if (!code || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyAccessCode(code);
      storeCode(code);
      onUnlocked();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) setError("gate.invalid");
      else if (err instanceof ApiRequestError && err.status === 429) setError("gate.locked");
      else setError("gate.network");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <span className="grid size-12 place-items-center rounded-2xl bg-terracotta/12 text-terracotta-deep" aria-hidden="true">
        <LuKeyRound className="size-6" />
      </span>
      <div>
        <h1 className="mb-1 text-[1.7rem] font-medium leading-tight">{t("gate.title")}</h1>
        <p className="text-ink-soft">{t("gate.subtitle")}</p>
      </div>
      <label className={label}>
        {t("gate.label")}
        <input
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder={t("gate.placeholder")}
          maxLength={200}
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={error === "gate.invalid"}
          aria-describedby={error ? "gate-error" : undefined}
        />
      </label>
      <p id="gate-error" role="alert" className="min-h-5 text-sm font-semibold text-terracotta-deep">
        {error ? t(error) : ""}
      </p>
      <button type="submit" className={btn("primary", "lg", "w-full")} disabled={busy || !phrase.trim()}>
        {busy ? t("gate.checking") : t("gate.submit")}
      </button>
      <Link to="/s/example" className="text-center text-sm font-semibold text-ink-soft underline-offset-4 hover:text-ink hover:underline">
        {t("gate.example")}
      </Link>
    </form>
  );
}
