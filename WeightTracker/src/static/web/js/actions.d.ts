/** @type {Map<string, () => Promise<void>>} */
export const route: any;
export function publish(event: string, data: HTMLElement | any, options?: {
    wait: number;
}): void;
export function subscribe(event: string | HTMLElement, options: {
    lock: boolean;
} | SubscribeFunction, f?: SubscribeFunction): void;
export type Subscribe = {
    element: HTMLButtonElement | HTMLFormElement | HTMLInputElement | undefined;
    event: string | undefined;
    detail: any | undefined;
};
export type SubscribeFunction = (d: Subscribe) => Promise<void>;
export type SubscribeOptions = {
    f: SubscribeFunction;
    lock: boolean;
};
declare const lock: any;
export {};
