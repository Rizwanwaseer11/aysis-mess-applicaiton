import LaunchSplash from "./src/components/LaunchSplash";
import BrandLogo from "./src/components/BrandLogo";
import SiteOverview from "./src/components/SiteOverview";
import { normalizeScan, normalizeEmployeeNumber } from "./src/lib/input";
import EmployeePhoto from "./src/components/EmployeePhoto";
import { employeePhotoCache, photoKey } from "./src/lib/photoDisk";
import { useKeepAwake } from "expo-keep-awake";
import { Provider, useDispatch, useSelector } from "react-redux";
import {
  store,
  setBootstrap,
  setRecent as recentReceived,
  clear,
  type RootState,
} from "./src/store";
import DailyRecords from "./src/components/DailyRecords";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Crypto from "expo-crypto";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import {
  canConfirmPhoto,
  resultResetDelay,
  isDefinitiveFailure,
} from "./src/lib/scannerPolicy";
import {
  api,
  ApiError,
  installationId,
  restoreSession,
  renewSession,
  saveSession,
  restorePending,
  storePending,
  type Pending,
} from "./src/lib/api";
import { colors, styles as s } from "./src/theme";

import type { Bootstrap, Result, Recent } from "./src/types";
function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[s.button, secondary && s.secondary, disabled && s.disabled]}
    >
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}

export default function App() {
  const [showIntro, setShowIntro] = useState(true);
  const finishIntro = useCallback(() => setShowIntro(false), []);
  return (
    <Provider store={store}>
      <View style={{ flex: 1, backgroundColor: colors.page }}>
        <Scanner />
        {showIntro && <LaunchSplash onDone={finishIntro} />}
      </View>
    </Provider>
  );
}
function Awake() {
  useKeepAwake("scanner", { suppressDeactivateWarnings: true });
  return null;
}
function Scanner() {
  const dispatch = useDispatch();
  const boot = useSelector((state: RootState) => state.scanner.bootstrap);
  const recent = useSelector((state: RootState) => state.scanner.recent);
  const setBoot = useCallback(
    (value: Bootstrap | null) => {
      dispatch(setBootstrap(value));
    },
    [dispatch],
  );
  const setRecent = useCallback(
    (value: Recent[]) => {
      dispatch(recentReceived(value));
    },
    [dispatch],
  );
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [manualInput, setManualInput] = useState(false);
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [clockOffset, setClockOffset] = useState(0);
  const { width, height } = useWindowDimensions();
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const wide = workspaceWidth >= 852;
  const columnWidth = wide && !recordsOpen ? (workspaceWidth - 20) / 2 : "100%";
  const compact = height < 520;
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(true);
  const [code, setCode] = useState("");
  const [card, setCard] = useState("");
  const [busy, setBusy] = useState(false);
  const gate = useRef(false);
  const queuedScan = useRef<string | null>(null);
  const keyboardBuffer = useRef("");
  const keyboardLast = useRef(0);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loadedPhotoId, setLoadedPhotoId] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [camera, setCamera] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [now, setNow] = useState(Date.now());
  const input = useRef<TextInput>(null);
  const scroll = useRef<ScrollView>(null);
  const syncing = useRef(false);
  const [foreground, setForeground] = useState(
    AppState.currentState !== "background" &&
      AppState.currentState !== "inactive",
  );
  const approvedSound = useAudioPlayer(require("./assets/approved.wav"));
  const deniedSound = useAudioPlayer(require("./assets/denied.wav"));
  const nextEmployee = useCallback(() => {
    setResult(null);
    setError("");
    setCard("");
    setEmployeeNumber("");
    setLoadedPhotoId(null);
    setPhotoFailed(false);
  }, []);
  const invalidateDevice = useCallback(async () => {
    dispatch(clear());
    queuedScan.current = null;
    setRecordsOpen(false);
    setActive(false);
    setOnline(false);
    setResult(null);
    setLoadedPhotoId(null);
    setBoot(null);
    setRecent([]);
    setCard("");
    setCamera(false);
    setError(
      "Device session expired or revoked. Ask your site admin for a new activation code. Check any interrupted serving before reactivation.",
    );
    try {
      await saveSession(null);
    } catch {
      setError(
        "The credential could not be removed from secure storage. Ask your administrator to reissue this device before continuing.",
      );
    }
  }, []);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: false,
      shouldPlayInBackground: false,
      allowsRecording: false,
    }).catch(() => {});
    const listener = AppState.addEventListener("change", (state) => {
      setForeground(state === "active");
      if (state !== "active") setCamera(false);
    });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (
      !active ||
      !foreground ||
      busy ||
      pending ||
      camera ||
      recordsOpen ||
      manualInput
    )
      return;
    const timer = setTimeout(() => {
      input.current?.focus();
      scroll.current?.scrollTo({ y: 0, animated: false });
    }, 100);
    return () => clearTimeout(timer);
  }, [
    active,
    foreground,
    busy,
    pending,
    result,
    camera,
    recordsOpen,
    manualInput,
  ]);
  useEffect(() => {
    const delay = resultResetDelay(result, !!pending, foreground, 10);
    if (delay === null) return;
    const timer = setTimeout(nextEmployee, delay);
    return () => clearTimeout(timer);
  }, [
    result,
    pending,
    foreground,
    boot?.device.settings?.resultDisplaySeconds,
    nextEmployee,
  ]);
  useEffect(() => {
    if (
      !foreground ||
      !result ||
      result.decision === "PENDING_CONFIRMATION" ||
      boot?.device.settings?.soundEnabled === false
    )
      return;
    let cancelled = false;
    const player = result.decision === "APPROVED" ? approvedSound : deniedSound;
    void player
      .seekTo(0)
      .then(() => {
        if (!cancelled) player.play();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      player.pause();
    };
  }, [
    result,
    foreground,
    boot?.device.settings?.soundEnabled,
    approvedSound,
    deniedSound,
  ]);

  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const data = await api<Bootstrap>("/bootstrap");
      setClockOffset(Date.parse(data.serverTime) - Date.now());
      await employeePhotoCache.setScope(
        await photoKey(JSON.stringify([data.site.id, data.device.id])),
      );
      setBoot(data);
      await api("/heartbeat", { appVersion: "0.1.0" });
      setOnline(true);
      setRecent(await api<Recent[]>("/recent"));
    } catch (e) {
      setOnline(false);
      if (e instanceof ApiError && e.status === 401) await invalidateDevice();
    } finally {
      syncing.current = false;
    }
  }, [invalidateDevice]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const saved = await restoreSession();
        const action = await restorePending();
        if (!mounted) return;
        setActive(saved);
        setPending(action);
        if (saved) {
          await sync();
        }
      } catch (e) {
        setError(String(e));
      } finally {
        if (mounted) setStarting(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [sync]);
  useEffect(() => {
    if (!active || !foreground) return;
    const timer = setInterval(() => setNow(Date.now()), result ? 1000 : 60000);
    return () => clearInterval(timer);
  }, [active, foreground, result]);
  useEffect(() => {
    if (!active || !foreground) return;
    void sync();
    const timer = setInterval(() => void sync(), 30000);
    const renew = setInterval(() => {
      void renewSession().catch((error) => {
        if (error instanceof ApiError && error.status === 401)
          void invalidateDevice();
      });
    }, 3600000);
    return () => {
      clearInterval(timer);
      clearInterval(renew);
    };
  }, [active, foreground, sync, invalidateDevice]);

  async function run(task: () => Promise<void>) {
    if (gate.current) return;
    gate.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Request failed. Retry the same action.",
      );
      setOnline(e instanceof ApiError && e.status !== 401 && e.status < 500);
      if (e instanceof ApiError && e.status === 401) await invalidateDevice();
    } finally {
      gate.current = false;
      setBusy(false);
    }
  }
  async function activate() {
    await run(async () => {
      const data = await api<{ deviceToken: string }>("/activate", {
        activationCode: code,
        installationId: await installationId(),
        platform: Platform.OS,
        appVersion: "0.1.0",
      });
      if (!(await saveSession(data.deviceToken))) return;
      await storePending(null);
      setPending(null);
      setResult(null);
      setActive(true);
      setCode("");
      await sync();
    });
  }
  async function send(action: Pending) {
    // Never invent a new event after a timeout: replay the persisted operation.
    await storePending(action);
    setPending(action);
    if (
      (action.kind === "preview" || action.kind === "manual") &&
      Date.now() - action.createdAt > 120000
    ) {
      await storePending(null);
      setPending(null);
      throw new Error("Scan expired. Scan the card again.");
    }
    let value: Result;
    try {
      value =
        action.kind === "manual"
          ? await api<Result>("/previews", {
              employeeNumber: action.employeeNumber,
              scanEventId: action.scanEventId,
            })
          : action.kind === "preview"
            ? await api<Result>("/previews", {
                qrToken: action.qrToken,
                scanEventId: action.scanEventId,
              })
            : action.kind === "confirm"
              ? await api<Result>("/confirmations", {
                  previewId: action.previewId,
                  photoConfirmed: true,
                })
              : await api<Result>("/rejections", {
                  previewId: action.previewId,
                  reason: action.reason,
                });
    } catch (e) {
      if (e instanceof ApiError && isDefinitiveFailure(e.status)) {
        await storePending(null);
        setPending(null);
        setResult(null);
      }
      throw e;
    }
    await storePending(null);
    setPending(null);
    setClockOffset(Date.parse(value.serverTime) - Date.now());
    setResult(value);
    scroll.current?.scrollTo({ y: 0, animated: true });
    setOnline(true);
    setCard("");
    setLoadedPhotoId(null);
    setPhotoFailed(false);
    void sync();
  }
  function scan(value: string) {
    const qr = normalizeScan(value);
    if (gate.current && active && foreground && !recordsOpen && qr) {
      if (queuedScan.current) {
        setError(
          "Scanner is busy. Please rescan this card after the current check.",
        );
        return;
      }
      queuedScan.current = qr;
      setCard("");
      return;
    }
    if (!active || !foreground || recordsOpen || pending) {
      setCard("");
      setError(
        "Finish or retry the current request, then scan the card again.",
      );
      return;
    }
    if (!qr) {
      setError("Scan a valid employee QR card.");
      return;
    }
    nextEmployee();
    setCamera(false);
    void run(() =>
      send({
        kind: "preview",
        qrToken: qr,
        scanEventId: Crypto.randomUUID(),
        createdAt: Date.now(),
      }),
    );
  }
  useEffect(() => {
    if (
      Platform.OS !== "web" ||
      !active ||
      !foreground ||
      recordsOpen ||
      manualInput ||
      camera
    )
      return;

    const keydown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const time = Date.now();
      if (time - keyboardLast.current > 1000) keyboardBuffer.current = "";
      keyboardLast.current = time;
      if (event.key === "Enter" || event.key === "Tab") {
        if (!keyboardBuffer.current) return;
        event.preventDefault();
        event.stopPropagation();
        const value = keyboardBuffer.current;
        keyboardBuffer.current = "";
        setCard("");
        scan(value);
      } else if (event.key.length === 1) {
        event.preventDefault();
        event.stopPropagation();
        keyboardBuffer.current = (keyboardBuffer.current + event.key).slice(
          -202,
        );
        setCard(keyboardBuffer.current);
      }
    };
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  }, [active, foreground, recordsOpen, manualInput, camera, pending]);
  useEffect(() => {
    if (busy || pending || !active || !foreground || !queuedScan.current)
      return;
    const value = queuedScan.current;
    queuedScan.current = null;
    scan(value);
  }, [busy, pending, active, foreground]);
  function manualScan() {
    if (!active || !foreground || recordsOpen || pending || gate.current)
      return;
    const number = normalizeEmployeeNumber(employeeNumber);
    if (!number) {
      setError("Enter the employee ID printed on the card, e.g. EMP-000001.");
      return;
    }
    nextEmployee();
    setCamera(false);
    void run(() =>
      send({
        kind: "manual",
        employeeNumber: number,
        scanEventId: Crypto.randomUUID(),
        createdAt: Date.now(),
      }),
    );
  }
  const waiting = result?.decision === "PENDING_CONFIRMATION";
  const expired =
    !!result?.expiresAt && Date.parse(result.expiresAt) <= now + clockOffset;
  const serverNow = now + clockOffset;
  const clock = new Date(serverNow).toLocaleTimeString("en-GB", {
    timeZone: boot?.site.timezone || "Asia/Karachi",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.screen}>
        {active && foreground && (busy || !!result || camera) && <Awake />}
        <StatusBar style="light" />
        <View
          style={[
            s.header,
            width < 480 && { flexWrap: "wrap" },
            compact && { paddingVertical: 6 },
          ]}
        >
          <View style={s.brand}>
            <BrandLogo width={width < 480 ? 104 : 136} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.title}>Mess Scanner</Text>
              <Text style={s.subtitle}>
                {boot?.site.name ||
                  (active ? "Loading registered site…" : "Device activation")}
              </Text>
            </View>
          </View>
          <View>
            <Text
              style={[s.badge, { color: online ? colors.green : colors.muted }]}
            >
              {online ? "Connected" : "Not connected"}
            </Text>
            <Text style={s.subtitle}>{clock}</Text>
          </View>
        </View>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            ref={scroll}
            key={recordsOpen ? "records" : "scanner"}
            style={{ flex: 1 }}
            contentContainerStyle={[
              s.content,
              (width < 600 || compact) && { padding: 12 },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View
              onLayout={(event) => {
                const next = event.nativeEvent.layout.width;
                setWorkspaceWidth((current) =>
                  Math.abs(current - next) < 1 ? current : next,
                );
              }}
              style={[s.workspace, wide && !recordsOpen && s.workspaceWide]}
            >
              <View
                style={[s.mainColumn, { width: columnWidth }]}
                testID="scanner-main-column"
              >
                {active && !pending && !result && !busy && (
                  <Button
                    secondary
                    title={
                      recordsOpen ? "Back to scanner" : "Daily records / report"
                    }
                    onPress={() => {
                      setRecordsOpen(!recordsOpen);
                      setCamera(false);
                      setManualInput(false);
                    }}
                  />
                )}
                {recordsOpen && active ? (
                  <DailyRecords
                    onRevoked={invalidateDevice}
                    site={boot?.site}
                    device={boot?.device}
                  />
                ) : starting ? (
                  <ActivityIndicator color={colors.primary} />
                ) : !active ? (
                  <View
                    style={[
                      s.panel,
                      width < 600 && { padding: 20 },
                      result && {
                        borderColor:
                          result.decision === "APPROVED"
                            ? colors.green
                            : result.decision === "DENIED"
                              ? colors.red
                              : colors.primary,
                        borderWidth: 2,
                      },
                    ]}
                  >
                    <BrandLogo width={180} />
                    <Text style={s.eyebrow}>WELCOME TO AYSIS</Text>
                    <Text style={s.heading}>Connect your tablet</Text>
                    <Text style={s.muted}>
                      Enter the eight-digit code from your site administrator.
                      This device will be assigned to their site.
                    </Text>
                    {!!pending && (
                      <Text style={s.error}>
                        An interrupted request remains on this device. Ask your
                        site admin to check its meal record before reactivating.
                      </Text>
                    )}
                    <TextInput
                      style={s.input}
                      accessibilityLabel="Activation code"
                      value={code}
                      onChangeText={setCode}
                      keyboardType="number-pad"
                      maxLength={8}
                      placeholder="00000000"
                      placeholderTextColor={colors.muted}
                    />
                    <Button
                      title="Activate device"
                      onPress={() => void activate()}
                      disabled={busy || code.length !== 8}
                    />
                  </View>
                ) : (
                  <View
                    style={[
                      s.panel,
                      width < 600 && { padding: 20 },
                      result && {
                        borderColor:
                          result.decision === "APPROVED"
                            ? colors.green
                            : result.decision === "DENIED"
                              ? colors.red
                              : colors.primary,
                      },
                    ]}
                  >
                    {pending ? (
                      <>
                        <Text style={s.heading}>
                          {busy ? "Checking card…" : "Resolve previous scan"}
                        </Text>
                        <Text style={s.muted}>
                          {busy
                            ? "Please wait while the server validates this request."
                            : "The previous request has no confirmed response. Retry it before scanning another employee."}
                        </Text>
                        <Button
                          title="Retry previous request"
                          onPress={() => void run(() => send(pending))}
                          disabled={busy}
                        />
                      </>
                    ) : result ? (
                      <>
                        <Text
                          style={[
                            s.heading,
                            result.decision === "APPROVED"
                              ? { color: colors.green }
                              : result.decision === "DENIED"
                                ? { color: colors.red }
                                : null,
                          ]}
                        >
                          {waiting
                            ? "Verify employee"
                            : result.decision === "APPROVED"
                              ? "Meal served"
                              : "Meal not served"}
                        </Text>
                        {foreground && result.employee && (
                          <>
                            <EmployeePhoto
                              key={
                                result.previewId +
                                ":" +
                                result.employee.photoUrl
                              }
                              path={result.employee.photoUrl}
                              previewId={result.previewId}
                              style={s.photo}
                              onLoad={() => setLoadedPhotoId(result.previewId)}
                              onError={() => {
                                setPhotoFailed(true);
                                setLoadedPhotoId(null);
                              }}
                            />
                            <Text style={s.title}>
                              {result.employee.fullName}
                            </Text>
                            <Text style={s.muted}>
                              {result.employee.employeeNumber} ·{" "}
                              {result.meal?.name}
                            </Text>
                          </>
                        )}
                        {waiting ? (
                          <>
                            <Text style={s.muted}>
                              {expired
                                ? "Preview expired. Cancel and scan again."
                                : "Compare the person with this photo before serving their meal."}
                            </Text>
                            {photoFailed && (
                              <Text style={s.error}>
                                Photo could not be loaded. Do not serve without
                                verifying identity.
                              </Text>
                            )}
                            <Button
                              title="Photo matches — confirm serving"
                              disabled={
                                busy ||
                                !foreground ||
                                !!pending ||
                                !canConfirmPhoto(
                                  result,
                                  loadedPhotoId,
                                  serverNow,
                                )
                              }
                              onPress={() =>
                                void run(() =>
                                  send({
                                    kind: "confirm",
                                    previewId: result.previewId,
                                  }),
                                )
                              }
                            />
                            <Button
                              title={
                                photoFailed
                                  ? "Reject: photo unavailable"
                                  : "Reject: person does not match"
                              }
                              secondary
                              disabled={busy}
                              onPress={() =>
                                void run(() =>
                                  send({
                                    kind: "reject",
                                    previewId: result.previewId,
                                    reason: photoFailed
                                      ? "PHOTO_UNAVAILABLE"
                                      : "IDENTITY_MISMATCH",
                                  }),
                                )
                              }
                            />
                            <Button
                              title="Cancel scan"
                              secondary
                              disabled={busy}
                              onPress={() =>
                                void run(() =>
                                  send({
                                    kind: "reject",
                                    previewId: result.previewId,
                                    reason: "CANCELLED",
                                  }),
                                )
                              }
                            />
                          </>
                        ) : (
                          <>
                            <Text style={s.muted}>
                              {result.reasonCode.replaceAll("_", " ")}
                            </Text>
                            <Button
                              title="Next employee"
                              onPress={nextEmployee}
                            />
                          </>
                        )}
                      </>
                    ) : null}
                    {!pending && (
                      <>
                        {!result && (
                          <View
                            style={[
                              s.scanFrame,
                              compact && { width: 72, height: 72, margin: 0 },
                            ]}
                          >
                            <Text style={s.scanIcon}>▦</Text>
                          </View>
                        )}
                        {!result && (
                          <Text style={s.eyebrow}>
                            EMPLOYEE MEAL VERIFICATION
                          </Text>
                        )}
                        <Text style={s.heading}>
                          {result
                            ? "Scan the next card anytime"
                            : "Ready to scan"}
                        </Text>
                        {!!boot?.device.settings?.kioskMessage && (
                          <Text style={s.muted}>
                            {boot.device.settings.kioskMessage}
                          </Text>
                        )}
                        <Text style={s.muted}>
                          Scan the employee QR card. Their photo will appear
                          here for verification.
                        </Text>
                        {foreground && camera && permission?.granted ? (
                          <View style={s.camera}>
                            <CameraView
                              style={{ flex: 1 }}
                              facing="back"
                              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                              onBarcodeScanned={({ data }) => scan(data)}
                            />
                          </View>
                        ) : null}
                        <Button
                          title={
                            manualInput
                              ? "Back to USB / Bluetooth scanner"
                              : "Enter employee ID manually"
                          }
                          secondary
                          onPress={() => {
                            setManualInput(!manualInput);
                            input.current?.focus();
                          }}
                        />
                        {manualInput && (
                          <>
                            <TextInput
                              style={s.input}
                              accessibilityLabel="Employee ID"
                              placeholder="EMP-000001"
                              placeholderTextColor={colors.muted}
                              value={employeeNumber}
                              onChangeText={setEmployeeNumber}
                              autoCapitalize="characters"
                              autoCorrect={false}
                              maxLength={24}
                              onSubmitEditing={manualScan}
                              editable={!busy}
                            />
                            <Button
                              title="Check employee ID"
                              onPress={manualScan}
                              disabled={busy || !employeeNumber}
                            />
                          </>
                        )}
                        <Button
                          title={camera ? "Close camera" : "Use camera"}
                          secondary
                          disabled={busy}
                          onPress={() =>
                            void run(async () => {
                              if (camera) {
                                setCamera(false);
                                return;
                              }
                              const access = permission?.granted
                                ? permission
                                : await requestPermission();
                              if (access.granted) {
                                setCamera(true);
                              } else {
                                setError(
                                  "Camera access is required. Enable it in device settings or use a USB scanner.",
                                );
                              }
                            })
                          }
                        />
                      </>
                    )}
                  </View>
                )}
                {active && !recordsOpen && !manualInput && !camera && (
                  <View style={s.contextCard}>
                    <TextInput
                      ref={input}
                      style={s.input}
                      accessibilityLabel="Employee QR code"
                      placeholder="Scan with USB / Bluetooth reader"
                      placeholderTextColor={colors.muted}
                      value={card}
                      onChangeText={(value) => {
                        if (/[\r\n]/.test(value)) {
                          scan(value);
                          setCard("");
                        } else setCard(value);
                      }}
                      maxLength={202}
                      showSoftInputOnFocus={false}
                      onSubmitEditing={(event) => {
                        scan(event.nativeEvent.text);
                        setCard("");
                      }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={true}
                      submitBehavior="submit"
                    />
                    <Button
                      title="Check employee"
                      onPress={() => scan(card)}
                      disabled={busy || !card}
                    />
                  </View>
                )}
                {busy && <ActivityIndicator color={colors.primary} />}
                {!!error && (
                  <Text accessibilityRole="alert" style={s.error}>
                    {error}
                  </Text>
                )}
                {active && !online && !busy && !pending && !result && (
                  <Button
                    title="Reconnect / retry"
                    secondary
                    onPress={() => void run(sync)}
                  />
                )}
                {active && !online && !busy && !pending && !result && (
                  <Button
                    title="Enter a new activation code"
                    secondary
                    onPress={() => void run(invalidateDevice)}
                  />
                )}
              </View>
              {active && !recordsOpen && (
                <View
                  style={{ width: columnWidth }}
                  testID="scanner-site-column"
                >
                  <SiteOverview boot={boot} recent={recent} section="summary" />
                </View>
              )}
            </View>
            {active && !recordsOpen && (
              <View style={{ width: "100%", maxWidth: 1240 }}>
                <SiteOverview boot={boot} recent={recent} section="recent" />
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
