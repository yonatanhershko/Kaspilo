import { router } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AppState,
  Image,
  type ImageSourcePropType,
  Linking,
  Platform,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PressScale } from "@/components/ui/PressScale";
import { ProgressFill } from "@/components/ui/ProgressFill";
import { Screen } from "@/components/ui/Screen";
import { useRowAlign } from "@/i18n";
import {
  adviseIosUpdate,
  IOS27_SHORTCUT_URL,
  isListenerEnabled,
  markPurchaseSetupDone,
  openListenerSettings,
  quickSetupHere,
} from "@/purchase";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * "Purchase detected" setup, once per phone (docs/spec.md "Purchase detected").
 * iPhone: intro → manual guide with screenshots (or, on iOS 27 with the shared shortcut, the
 * two-step quick path) → done. An iPhone below iOS 27 is advised to update when the quick
 * path exists. Android: the notification-access explanation Google Play requires → settings → done.
 */

// Apple's own "Update your iPhone" page (opens in the browser).
const IOS_UPDATE_HELP_URL = "https://support.apple.com/HT204204";

type Mark = { x: number; y: number };
type Shot = { source: ImageSourcePropType; ratio: number };
type GuideStep = { key: string; image?: Shot; mark?: Mark };

// Screenshots from an iOS 26 iPhone (Hebrew), status bar cropped off, 600 px wide (`ratio` is
// width / height). `mark` is the tap point in percent of the picture.
const GUIDE: GuideStep[] = [
  {
    key: "automation",
    image: {
      source: require("../../../assets/images/purchase-setup/1-new-automation.jpg"),
      ratio: 600 / 1209,
    },
    mark: { x: 50, y: 60.5 },
  },
  {
    key: "wallet",
    image: {
      source: require("../../../assets/images/purchase-setup/2-wallet.jpg"),
      ratio: 600 / 1209,
    },
    mark: { x: 76, y: 49 },
  },
  { key: "cards" },
  {
    key: "search",
    image: {
      source: require("../../../assets/images/purchase-setup/4-search.jpg"),
      ratio: 600 / 553,
    },
    mark: { x: 62, y: 88.5 },
  },
  {
    key: "amount",
    image: {
      source: require("../../../assets/images/purchase-setup/5-amount.jpg"),
      ratio: 600 / 1220,
    },
    mark: { x: 82, y: 93 },
  },
  {
    key: "merchant",
    image: {
      source: require("../../../assets/images/purchase-setup/6-merchant.jpg"),
      ratio: 600 / 1211,
    },
    mark: { x: 82, y: 76.8 },
  },
];

type Stage =
  | { name: "intro" }
  | { name: "update" }
  | { name: "guide"; step: number }
  | { name: "quick"; step: number }
  | { name: "android"; tried: boolean }
  | { name: "done" };

export default function PurchaseSetupScreen() {
  const [stage, setStage] = useState<Stage>(
    Platform.OS === "android"
      ? { name: "android", tried: false }
      : { name: "intro" },
  );

  useEffect(() => {
    if (stage.name === "done") void markPurchaseSetupDone();
  }, [stage.name]);

  // Android: back from the phone's settings with Kaspilo switched on → done.
  useEffect(() => {
    if (stage.name !== "android") return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && isListenerEnabled()) setStage({ name: "done" });
    });
    return () => sub.remove();
  }, [stage.name]);

  const close = () =>
    router.canGoBack() ? router.back() : router.replace("/notifications");

  switch (stage.name) {
    case "intro":
      return (
        <Intro
          onClose={close}
          onStart={() =>
            setStage(
              quickSetupHere
                ? { name: "quick", step: 0 }
                : { name: "guide", step: 0 },
            )
          }
          onUpdate={() => setStage({ name: "update" })}
        />
      );
    case "update":
      return (
        <UpdateAdvice
          onClose={close}
          onManual={() => setStage({ name: "guide", step: 0 })}
        />
      );
    case "guide":
      return (
        <Guide
          step={stage.step}
          onClose={close}
          onBack={() =>
            setStage(
              stage.step === 0
                ? { name: "intro" }
                : { name: "guide", step: stage.step - 1 },
            )
          }
          onNext={() =>
            setStage(
              stage.step === GUIDE.length - 1
                ? { name: "done" }
                : { name: "guide", step: stage.step + 1 },
            )
          }
        />
      );
    case "quick":
      return (
        <Quick
          step={stage.step}
          onClose={close}
          onBack={() =>
            setStage(
              stage.step === 0 ? { name: "intro" } : { name: "quick", step: 0 },
            )
          }
          onNext={() =>
            setStage(
              stage.step === 0 ? { name: "quick", step: 1 } : { name: "done" },
            )
          }
        />
      );
    case "android":
      return (
        <AndroidDisclosure
          tried={stage.tried}
          onClose={close}
          onAgree={() => {
            if (isListenerEnabled()) return setStage({ name: "done" });
            openListenerSettings();
            setStage({ name: "android", tried: true });
          }}
        />
      );
    case "done":
      return <Done onFinish={close} />;
  }
}

// ---- pieces -----------------------------------------------------------------

function Shell({
  progress,
  onClose,
  children,
  footer,
}: {
  progress?: number;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Screen leaves="none" scroll className="gap-5 px-5 pt-3">
      <View className="min-h-[44px] flex-row items-center gap-3">
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={t("purchaseSetup.close")}
          className="h-11 w-11 items-center justify-center"
          onPress={onClose}
        >
          <Icon name="close" size={26} />
        </PressScale>
        {progress !== undefined && (
          <View
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary"
            accessibilityRole="progressbar"
            accessibilityValue={{
              min: 0,
              max: 100,
              now: Math.round(progress * 100),
            }}
          >
            <ProgressFill
              ratio={progress}
              style={{
                backgroundColor: colors.primary,
                height: "100%",
                borderRadius: 999,
              }}
            />
          </View>
        )}
        {progress !== undefined && <View className="w-11" />}
      </View>
      <View className="flex-1 gap-5">{children}</View>
      <View className="gap-3 pb-4">{footer}</View>
    </Screen>
  );
}

function Title({ title, body }: { title: string; body?: string }) {
  return (
    <View className="gap-2">
      <AppText
        weight="bold"
        className="text-[26px] leading-[34px]"
        accessibilityRole="header"
      >
        {title}
      </AppText>
      {body ? (
        <AppText tone="muted" className="text-[16px] leading-[23px]">
          {body}
        </AppText>
      ) : null}
    </View>
  );
}

function Point({ icon, text }: { icon: string; text: string }) {
  const align = useRowAlign();
  return (
    <View className={`items-start gap-3 ${align.row}`}>
      <Icon name={icon} tone="primary" />
      <AppText className="flex-1 text-[15px] leading-[22px]">{text}</AppText>
    </View>
  );
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      className="min-h-[44px] justify-center"
      onPress={onPress}
    >
      <AppText
        weight="medium"
        tone="muted"
        className="text-center text-[15px] underline"
      >
        {label}
      </AppText>
    </PressScale>
  );
}

function Note({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const align = useRowAlign();
  return (
    <View className="gap-2 rounded-xl border border-border bg-surface p-4">
      <View className={`items-center gap-3 ${align.row}`}>
        <Icon name={icon} tone="primary" />
        <AppText weight="medium" className="flex-1 text-[16px]">
          {title}
        </AppText>
      </View>
      <AppText tone="muted" className="text-[14px] leading-[20px]">
        {body}
      </AppText>
      {action}
    </View>
  );
}

function Intro({
  onClose,
  onStart,
  onUpdate,
}: {
  onClose: () => void;
  onStart: () => void;
  onUpdate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Shell
      progress={0.02}
      onClose={onClose}
      footer={
        <>
          <Button label={t("purchaseSetup.intro.start")} onPress={onStart} />
          <TextLink label={t("purchaseSetup.intro.later")} onPress={onClose} />
        </>
      }
    >
      <Title
        title={t("purchaseSetup.intro.title")}
        body={t("purchaseSetup.intro.body")}
      />
      <View className="gap-4">
        <Point icon="creation-outline" text={t("purchaseSetup.intro.quick")} />
        <Point
          icon="shield-lock-outline"
          text={t("purchaseSetup.intro.private")}
        />
        <Point icon="gesture-tap" text={t("purchaseSetup.intro.guided")} />
      </View>
      {quickSetupHere && (
        <Note
          icon="lightning-bolt-outline"
          title={t("purchaseSetup.intro.quickTitle")}
          body={t("purchaseSetup.intro.quickBody")}
        />
      )}
      {adviseIosUpdate && (
        <Note
          icon="arrow-up-circle-outline"
          title={t("purchaseSetup.update.title")}
          body={t("purchaseSetup.intro.manualBody")}
          action={
            <TextLink
              label={t("purchaseSetup.intro.howToUpdate")}
              onPress={onUpdate}
            />
          }
        />
      )}
    </Shell>
  );
}

function UpdateAdvice({
  onClose,
  onManual,
}: {
  onClose: () => void;
  onManual: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Shell
      onClose={onClose}
      footer={
        <>
          <Button
            label={t("purchaseSetup.update.howButton")}
            icon={<Icon name="open-in-new" tone="onPrimary" size={20} />}
            onPress={() =>
              void Linking.openURL(IOS_UPDATE_HELP_URL).catch(() => undefined)
            }
          />
          <AppText tone="muted" className="text-center text-[13px]">
            {t("purchaseSetup.update.howNote")}
          </AppText>
          <TextLink
            label={t("purchaseSetup.update.manual")}
            onPress={onManual}
          />
          <AppText tone="muted" className="text-center text-[13px]">
            {t("purchaseSetup.update.manualNote")}
          </AppText>
        </>
      }
    >
      <View className="items-center py-4">
        <View className="h-28 w-28 items-center justify-center rounded-full bg-surface">
          <Icon name="cellphone-arrow-down" tone="primary" size={56} />
        </View>
      </View>
      <Title
        title={t("purchaseSetup.update.title")}
        body={t("purchaseSetup.update.body")}
      />
      <AppText weight="medium" className="text-[15px] leading-[22px]">
        {t("purchaseSetup.update.how")}
      </AppText>
    </Shell>
  );
}

function OpenShortcuts() {
  const { t } = useTranslation();
  return (
    <Button
      variant="outline"
      label={t("purchaseSetup.guide.openShortcuts")}
      icon={<Icon name="open-in-new" size={20} />}
      onPress={() =>
        void Linking.openURL("shortcuts://").catch(() => undefined)
      }
    />
  );
}

function BackNext({
  onBack,
  onNext,
  nextLabel,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
}) {
  const { t } = useTranslation();
  const align = useRowAlign();
  return (
    <View className={`gap-3 ${align.row}`}>
      {/* Back first: Hebrew puts Next at the left (forward), English at the right. */}
      <Button
        className="flex-1"
        variant="outline"
        label={t("purchaseSetup.guide.back")}
        onPress={onBack}
      />
      <Button
        className="flex-[2]"
        label={nextLabel ?? t("purchaseSetup.guide.next")}
        onPress={onNext}
      />
    </View>
  );
}

function Guide({
  step,
  onClose,
  onBack,
  onNext,
}: {
  step: number;
  onClose: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const current = GUIDE[step];
  const total = GUIDE.length;
  const base = `purchaseSetup.guide.steps.${current.key}`;
  return (
    <Shell
      progress={(step + 1) / (total + 1)}
      onClose={onClose}
      footer={
        <>
          <OpenShortcuts />
          <BackNext onBack={onBack} onNext={onNext} />
        </>
      }
    >
      <View className="gap-2">
        <AppText tone="muted" className="text-[13px]">
          {t("purchaseSetup.guide.stepOf", { n: step + 1, total })}
        </AppText>
        <Title title={t(`${base}.title`)} body={t(`${base}.body`)} />
      </View>
      {current.image ? (
        <Screenshot
          image={current.image}
          mark={current.mark}
          label={t(`${base}.title`)}
        />
      ) : (
        <View className="gap-4 rounded-xl border border-border bg-surface p-4">
          <Point
            icon="credit-card-check-outline"
            text={t("purchaseSetup.guide.steps.cards.pick")}
          />
          <Point
            icon="play-circle-outline"
            text={t("purchaseSetup.guide.steps.cards.runNow")}
          />
          <Point
            icon="bell-off-outline"
            text={t("purchaseSetup.guide.steps.cards.noNotify")}
          />
          <Point
            icon="chevron-right-circle-outline"
            text={t("purchaseSetup.guide.steps.cards.next")}
          />
        </View>
      )}
    </Shell>
  );
}

/** A screenshot in a phone-like frame, with a pulsing ring on the place to tap. */
function Screenshot({
  image,
  mark,
  label,
}: {
  image: Shot;
  mark?: Mark;
  label: string;
}) {
  const { source, ratio } = image;
  const tall = ratio < 0.8;
  return (
    <View
      className="self-center overflow-hidden rounded-[28px] border-4 border-border"
      style={{ width: tall ? "64%" : "92%", aspectRatio: ratio }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <Image
        source={source}
        style={{ width: "100%", height: "100%" }}
        resizeMode="cover"
      />
      {mark && <TapMark mark={mark} />}
    </View>
  );
}

function TapMark({ mark }: { mark: Mark }) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.set(
      reduceMotion
        ? 0.5
        : withRepeat(withTiming(1, { duration: 1600 }), -1, false),
    );
  }, [pulse, reduceMotion]);
  const ring = useAnimatedStyle(() => ({
    opacity: 0.6 * (1 - pulse.get()),
    transform: [{ scale: 1 + pulse.get() * 0.8 }],
  }));
  return (
    <View
      pointerEvents="none"
      className="absolute h-11 w-11"
      style={{
        left: `${mark.x}%`,
        top: `${mark.y}%`,
        marginLeft: -22,
        marginTop: -22,
      }}
    >
      <Animated.View
        className="absolute h-11 w-11 rounded-full border-2 border-primary"
        style={ring}
      />
      {/* A ring, not a dot: the label under it stays readable. */}
      <View className="h-11 w-11 rounded-full border-[3px] border-primary" />
    </View>
  );
}

function Quick({
  step,
  onClose,
  onBack,
  onNext,
}: {
  step: number;
  onClose: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const key = step === 0 ? "add" : "turnOn";
  return (
    <Shell
      progress={(step + 1) / 3}
      onClose={onClose}
      footer={
        <>
          {step === 0 ? (
            <Button
              variant="outline"
              label={t("purchaseSetup.quick.add.button")}
              icon={<Icon name="plus-circle-outline" size={20} />}
              onPress={() =>
                void Linking.openURL(IOS27_SHORTCUT_URL).catch(() => undefined)
              }
            />
          ) : (
            <OpenShortcuts />
          )}
          <BackNext onBack={onBack} onNext={onNext} />
        </>
      }
    >
      <View className="gap-2">
        <AppText tone="muted" className="text-[13px]">
          {t("purchaseSetup.guide.stepOf", { n: step + 1, total: 2 })}
        </AppText>
        <Title
          title={t(`purchaseSetup.quick.${key}.title`)}
          body={t(`purchaseSetup.quick.${key}.body`)}
        />
      </View>
    </Shell>
  );
}

function AndroidDisclosure({
  tried,
  onClose,
  onAgree,
}: {
  tried: boolean;
  onClose: () => void;
  onAgree: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Shell
      onClose={onClose}
      footer={
        <>
          <Button
            label={t(
              tried
                ? "purchaseSetup.android.again"
                : "purchaseSetup.android.agree",
            )}
            onPress={onAgree}
          />
          <TextLink label={t("purchaseSetup.intro.later")} onPress={onClose} />
        </>
      }
    >
      <Title
        title={t("purchaseSetup.android.title")}
        body={t("purchaseSetup.android.body")}
      />
      <View className="gap-4">
        <Point icon="wallet-outline" text={t("purchaseSetup.android.only")} />
        <Point
          icon="eye-off-outline"
          text={t("purchaseSetup.android.others")}
        />
        <Point
          icon="shield-lock-outline"
          text={t("purchaseSetup.android.private")}
        />
      </View>
      <Note
        icon="toggle-switch-outline"
        title={t("purchaseSetup.android.stepTitle")}
        body={t(
          tried
            ? "purchaseSetup.android.notYet"
            : "purchaseSetup.android.stepBody",
        )}
      />
    </Shell>
  );
}

function Done({ onFinish }: { onFinish: () => void }) {
  const { t } = useTranslation();
  return (
    <Shell
      progress={1}
      onClose={onFinish}
      footer={
        <Button label={t("purchaseSetup.done.finish")} onPress={onFinish} />
      }
    >
      <View className="items-center py-6">
        <View className="h-28 w-28 items-center justify-center rounded-full bg-surface">
          <Icon name="check-circle-outline" tone="primary" size={64} />
        </View>
      </View>
      <Title
        title={t("purchaseSetup.done.title")}
        body={t(
          Platform.OS === "android"
            ? "purchaseSetup.done.bodyAndroid"
            : "purchaseSetup.done.bodyIos",
        )}
      />
    </Shell>
  );
}
