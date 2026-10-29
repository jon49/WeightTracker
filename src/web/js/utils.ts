import type { WeightData } from "../server/db.js";

export function cleanWeightData(data: WeightData) {
  let nil = undefined;
  data.weight ||= nil;
  data.waist ||= nil;
  data.comments ||= nil;
  data.bedtime ||= nil;
  data.sleep ||= nil;
  if (!data.bedtime) {
    data.sleep = nil;
  }
}

export function dateAdd(date: Date, value: number, mutate = false) {
  let newDate = mutate ? date : new Date(date);
  newDate.setDate(date.getDate() + value);
  return newDate;
}

export function getPreviousDay(date: Date, targetDay: number) {
  date = new Date(date);
  while (date.getDay() !== targetDay) {
    dateAdd(date, -1, true);
  }
  return date;
}

export function dateToString(date: Date) {
  return `${date.getFullYear()}-${(date.getMonth() + 1 + "").padStart(2, "0")}-${(date.getDate() + "").padStart(2, "0")}`;
}

export function dateFill(from: Date, to: Date): string[] {
  from = new Date(from);
  // 1e3*60*60*24 == 86,400,000 ms to days
  const count = Math.ceil((+to - +from) / 864e5 + 1);
  const dates = new Array(count);
  for (let index = 0; index < count; index++) {
    dates[index] = dateToString(from);
    dateAdd(from, 1, true);
  }
  return dates;
}

export function round(number: number, precision: number) {
  let p = Math.pow(10, precision);
  return Math.round(number * p) / p;
}

export function reduceSlice<T, S>(
  data: T[],
  step: number,
  f: (acc: S, val: T, index: number) => S,
  init: () => S,
): S[] {
  const length = data.length;
  const arr = new Array(Math.ceil(length / step));
  for (let index = 0; index < length; index += step) {
    let acc = init instanceof Function ? init() : init;
    for (let i = index; i < step + index && i < length; i++) {
      acc = f(acc, data[i], i);
    }
    arr[index / step] = acc;
  }
  return arr;
}

export function avg(numbers: (number | undefined | null)[] | null | undefined): number | undefined {
  if ((numbers?.length ?? 0) < 1) return undefined;

  let sum = 0;
  let count = 0;
  for (let x of numbers!) {
    if (x) {
      sum += x;
      count++;
    }
  }

  if (count === 0) return;

  return sum / count;
}

// stdev is the population standard deviation of the values that are set.
// (avg skips zeros, so it cannot average the squared deviations: values equal
// to the mean have a deviation of 0 and must still count.)
export function stdev(numbers: (number | undefined | null)[] | undefined): number | undefined {
  let values = (numbers ?? []).filter((x): x is number => !!x);
  if (values.length === 0) return undefined;
  let average = avg(values)!;
  let sumOfSquares = 0;
  for (let x of values) {
    sumOfSquares += Math.pow(x - average, 2);
  }
  return Math.sqrt(sumOfSquares / values.length);
}

export function isNil(value: unknown): value is undefined | null {
  return value == null;
}

export function formatNumber(number: number | undefined, precision?: number): string | undefined {
  if (!number || Number.isNaN(number)) return;
  if (isNil(precision)) return "" + number;
  let multiplier = Math.pow(10, precision);
  return (Math.round(number * multiplier) / multiplier).toFixed(precision);
}

export function setDefaults<T>(o: T | undefined, defaults: [keyof T, T[keyof T]][]): T {
  if (!o) {
    o = <T>{};
  }
  for (const [key, value] of defaults) {
    if (!o[key]) {
      o[key] = value;
    }
  }
  return o;
}

export const isSelected =
  <T extends string>(currentValue: string | undefined) =>
    (value: T) =>
      value === currentValue ? "selected" : null;

export function toNumber(s: unknown) {
  // @ts-ignore
  return !isNaN(s) ? +s : undefined;
}
