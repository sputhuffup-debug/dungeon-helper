import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { probeDice, type DieSpec, type Rng } from "@campaign-forge/module-sdk";
import { Dialog } from "../primitives/Dialog";
import { EnterDice } from "./EnterDice";
import { usePhysicalDicePreference } from "./physicalDice";

/** A roll a button wants made: in the app, or with dice rolled at the table. */
export interface RollRequest {
  /** What is rolled, e.g. "Ripley: Panic roll". */
  title: string;
  /** The roll as a pure function of its Rng, to ask for the right dice in the right order. */
  run: (rng: Rng) => unknown;
  /** Make the roll (apply, log): with the faces typed at the table, or rolled in the app when `entered` is undefined. */
  perform: (entered?: number[]) => void;
  /** The GM closed the dialog without rolling. */
  onCancel?: () => void;
}

export interface DiceRollerValue {
  /** The GM rolls physical dice: rolls ask for the faces. */
  physical: boolean;
  /** Switch for this visit (the per-device preference is the default). */
  setPhysical: (on: boolean) => void;
  /** Roll in the app, or ask for the dice when `physical`. */
  roll: (req: RollRequest) => void;
  /** Ask for the dice rolled at the table, whatever the mode. */
  enter: (req: RollRequest) => void;
}

const fallback: DiceRollerValue = {
  physical: false,
  setPhysical: () => {},
  roll: (req) => req.perform(),
  enter: (req) => req.perform(),
};

const DiceRollerContext = createContext<DiceRollerValue>(fallback);

/** How the current page rolls: in the app, or by asking for physical dice. Without a provider, everything rolls in the app. */
export function useDiceRoller(): DiceRollerValue {
  return useContext(DiceRollerContext);
}

/**
 * Lets any roll button ask for dice rolled at the table: `roll()` performs
 * right away in app mode and opens the entry dialog in physical mode;
 * `enter()` always asks. The mode starts from the per-device preference and
 * can be switched for the visit (table mode's switch).
 */
export function DiceRollerProvider({ dice, children }: { dice?: DieSpec[]; children?: ReactNode }) {
  const [preference] = usePhysicalDicePreference();
  const [physical, setPhysical] = useState(preference);
  useEffect(() => setPhysical(preference), [preference]);
  const [pending, setPending] = useState<RollRequest | undefined>();
  const [error, setError] = useState<string | undefined>();

  const enter = useCallback((req: RollRequest) => {
    setError(undefined);
    setPending(req);
  }, []);
  // A roll that turns out to need no dice (an exempt android, an empty check list) just happens.
  const value = useMemo<DiceRollerValue>(() => ({ physical, setPhysical, enter, roll: (req) => (physical && needsDice(req.run) ? enter(req) : req.perform()) }), [physical, enter]);

  const close = () => {
    setPending(undefined);
    setError(undefined);
  };
  const cancel = () => {
    pending?.onCancel?.();
    close();
  };
  const perform = (entered?: number[]) => {
    if (!pending) return;
    try {
      pending.perform(entered);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <DiceRollerContext.Provider value={value}>
      {children}
      <Dialog open={!!pending} onClose={cancel} title={pending ? `Enter dice: ${pending.title}` : undefined} className="cf-enter-dialog">
        {pending && (
          <>
            <EnterDice run={pending.run} dice={dice} onSubmit={(faces) => perform(faces)} onRollInApp={() => perform()} onCancel={cancel} />
            {error && (
              <p className="cf-enter__status cf-enter__status--error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </Dialog>
    </DiceRollerContext.Provider>
  );
}

function needsDice(run: (rng: Rng) => unknown): boolean {
  const probe = probeDice(run);
  return probe.requests.length > 0 || !probe.complete;
}

/** A compact switch for a roll surface: roll in the app, or enter the dice rolled at the table. */
export function DiceModeSwitch({ physical, onChange, className }: { physical: boolean; onChange: (on: boolean) => void; className?: string }) {
  return (
    <span className={["cf-dice-mode", className].filter(Boolean).join(" ")} role="group" aria-label="How dice are rolled" data-testid="dice-mode">
      <button type="button" className="cf-dice-mode__opt" aria-pressed={!physical} onClick={() => onChange(false)} title="Roll in the app" data-testid="dice-mode-app">
        In app
      </button>
      <button type="button" className="cf-dice-mode__opt" aria-pressed={physical} onClick={() => onChange(true)} data-testid="dice-mode-enter">
        Enter dice
      </button>
    </span>
  );
}
