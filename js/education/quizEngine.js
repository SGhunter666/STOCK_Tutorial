/**
 * Quiz engine: parameterised question banks, grading and worked solutions.
 * Content is referenced by translation keys so the same questions work in both languages.
 */
import { createRng } from '../core/rng.js';

export const PASS_SCORE = 80;
export const TEST_OUT_SCORE = 90;

const T = (id, key) => ({ id, key });

function single(id, promptKey, options, explainKey, extra = {}) {
  return {
    id,
    build: () => ({
      type: 'single',
      promptKey,
      options,
      correctIds: options.filter((o) => o.correct).map((o) => o.key),
      explainKey,
      ...extra,
    }),
  };
}

function multi(id, promptKey, options, explainKey) {
  return {
    id,
    build: () => ({
      type: 'multi',
      promptKey,
      options,
      correctIds: options.filter((o) => o.correct).map((o) => o.key),
      explainKey,
    }),
  };
}

function numeric(id, promptKey, explainKey, buildParams) {
  return {
    id,
    build: (rng) => {
      const built = buildParams(rng);
      return {
        type: 'numeric',
        promptKey,
        explainKey,
        workKey: `quiz.${id.replace('-', '.')}.work`,
        ...built,
      };
    },
  };
}

const TRUE_FALSE = [T('true', 'common.true'), T('false', 'common.false')];

export const QUIZ_BANKS = {
  u1: [
    single(
      'u1-q1',
      'quiz.u1.q1.prompt',
      [
        { key: 'quiz.u1.q1.o1', correct: true },
        { key: 'quiz.u1.q1.o2' },
        { key: 'quiz.u1.q1.o3' },
        { key: 'quiz.u1.q1.o4' },
      ],
      'quiz.u1.q1.explain',
    ),
    single(
      'u1-q2',
      'quiz.u1.q2.prompt',
      [
        { key: 'quiz.u1.q2.o1', correct: true },
        { key: 'quiz.u1.q2.o2' },
        { key: 'quiz.u1.q2.o3' },
        { key: 'quiz.u1.q2.o4' },
      ],
      'quiz.u1.q2.explain',
    ),
    numeric(
      'u1-q3',
      'quiz.u1.q3.prompt',
      'quiz.u1.q3.explain',
      (rng) => {
        const price = Math.round(rng.range(18, 92) * 2) / 2;
        const shares = rng.int(40, 400);
        const answer = price * shares;
        return {
          params: { price, shares },
          paramKinds: { price: 'money', shares: 'integer' },
          answer,
          tolerance: Math.max(0.5, answer * 0.01),
          answerFormat: 'millions',
        };
      },
    ),
    single('u1-q4', 'quiz.u1.q4.prompt', TRUE_FALSE.map((o, i) => ({ ...o, correct: i === 1 })), 'quiz.u1.q4.explain'),
    multi(
      'u1-q5',
      'quiz.u1.q5.prompt',
      [
        { key: 'quiz.u1.q5.o1', correct: true },
        { key: 'quiz.u1.q5.o2', correct: true },
        { key: 'quiz.u1.q5.o3' },
        { key: 'quiz.u1.q5.o4', correct: true },
      ],
      'quiz.u1.q5.explain',
    ),
    single(
      'u1-q6',
      'quiz.u1.q6.prompt',
      [
        { key: 'quiz.u1.q6.o1', correct: true },
        { key: 'quiz.u1.q6.o2' },
        { key: 'quiz.u1.q6.o3' },
        { key: 'quiz.u1.q6.o4' },
      ],
      'quiz.u1.q6.explain',
    ),
  ],
  u2: [
    single(
      'u2-q1',
      'quiz.u2.q1.prompt',
      [
        { key: 'quiz.u2.q1.o1' },
        { key: 'quiz.u2.q1.o2', correct: true },
        { key: 'quiz.u2.q1.o3' },
        { key: 'quiz.u2.q1.o4' },
      ],
      'quiz.u2.q1.explain',
    ),
    numeric(
      'u2-q2',
      'quiz.u2.q2.prompt',
      'quiz.u2.q2.explain',
      (rng) => {
        const cash = 1000;
        const fee = 1;
        const price = rng.pick([7.9, 12.4, 17.5, 23.8, 31.2, 45.6, 58.4]);
        const answer = Math.floor((cash - fee) / price);
        return {
          params: { cash, price, fee },
          paramKinds: { cash: 'money', price: 'money', fee: 'money' },
          answer,
          tolerance: 0,
          answerFormat: 'integer',
        };
      },
    ),
    single('u2-q3', 'quiz.u2.q3.prompt', TRUE_FALSE.map((o, i) => ({ ...o, correct: i === 1 })), 'quiz.u2.q3.explain'),
    multi(
      'u2-q4',
      'quiz.u2.q4.prompt',
      [
        { key: 'quiz.u2.q4.o1', correct: true },
        { key: 'quiz.u2.q4.o2', correct: true },
        { key: 'quiz.u2.q4.o3' },
        { key: 'quiz.u2.q4.o4', correct: true },
      ],
      'quiz.u2.q4.explain',
    ),
    single(
      'u2-q5',
      'quiz.u2.q5.prompt',
      [
        { key: 'quiz.u2.q5.o1', correct: true },
        { key: 'quiz.u2.q5.o2' },
        { key: 'quiz.u2.q5.o3' },
        { key: 'quiz.u2.q5.o4' },
      ],
      'quiz.u2.q5.explain',
    ),
    numeric(
      'u2-q6',
      'quiz.u2.q6.prompt',
      'quiz.u2.q6.explain',
      (rng) => {
        const bid = Math.round(rng.range(20, 80) * 100) / 100;
        const ask = Math.round((bid + rng.range(0.02, 0.15)) * 100) / 100;
        const qty = rng.int(20, 200);
        const answer = (ask - bid) * qty;
        return {
          params: { bid, ask, qty },
          paramKinds: { bid: 'money', ask: 'money', qty: 'integer' },
          answer: Math.round(answer * 100) / 100,
          tolerance: 0.02,
          answerFormat: 'money',
        };
      },
    ),
  ],
  u3: [
    single(
      'u3-q1',
      'quiz.u3.q1.prompt',
      [
        { key: 'quiz.u3.q1.o1' },
        { key: 'quiz.u3.q1.o2', correct: true },
        { key: 'quiz.u3.q1.o3' },
        { key: 'quiz.u3.q1.o4' },
      ],
      'quiz.u3.q1.explain',
    ),
    numeric(
      'u3-q2',
      'quiz.u3.q2.prompt',
      'quiz.u3.q2.explain',
      (rng) => {
        const n1 = rng.int(10, 40);
        const n2 = rng.int(10, 40);
        const p1 = Math.round(rng.range(20, 60) * 100) / 100;
        const p2 = Math.round(rng.range(20, 60) * 100) / 100;
        const answer = (n1 * p1 + n2 * p2) / (n1 + n2);
        return {
          params: { n1, n2, p1, p2 },
          paramKinds: { n1: 'integer', n2: 'integer', p1: 'money', p2: 'money' },
          answer,
          tolerance: 0.02,
          answerFormat: 'money',
        };
      },
    ),
    numeric(
      'u3-q3',
      'quiz.u3.q3.prompt',
      'quiz.u3.q3.explain',
      (rng) => {
        const qty = rng.int(20, 100);
        const buy = Math.round(rng.range(20, 60) * 100) / 100;
        const sell = Math.round((buy + rng.range(1, 10)) * 100) / 100;
        const fee = 1;
        const answer = qty * (sell - buy) - fee * 2;
        return {
          params: { qty, buy, sell, fee },
          paramKinds: { qty: 'integer', buy: 'money', sell: 'money', fee: 'money' },
          answer: Math.round(answer * 100) / 100,
          tolerance: 0.02,
          answerFormat: 'money',
        };
      },
    ),
    single('u3-q4', 'quiz.u3.q4.prompt', TRUE_FALSE.map((o, i) => ({ ...o, correct: i === 1 })), 'quiz.u3.q4.explain'),
    multi(
      'u3-q5',
      'quiz.u3.q5.prompt',
      [
        { key: 'quiz.u3.q5.o1', correct: true },
        { key: 'quiz.u3.q5.o2', correct: true },
        { key: 'quiz.u3.q5.o3' },
        { key: 'quiz.u3.q5.o4', correct: true },
      ],
      'quiz.u3.q5.explain',
    ),
    single(
      'u3-q6',
      'quiz.u3.q6.prompt',
      [
        { key: 'quiz.u3.q6.o1' },
        { key: 'quiz.u3.q6.o2', correct: true },
        { key: 'quiz.u3.q6.o3' },
        { key: 'quiz.u3.q6.o4' },
      ],
      'quiz.u3.q6.explain',
    ),
  ],
  u4: [
    single(
      'u4-q1',
      'quiz.u4.q1.prompt',
      [
        { key: 'quiz.u4.q1.o1', correct: true },
        { key: 'quiz.u4.q1.o2' },
        { key: 'quiz.u4.q1.o3' },
        { key: 'quiz.u4.q1.o4' },
      ],
      'quiz.u4.q1.explain',
    ),
    numeric(
      'u4-q2',
      'quiz.u4.q2.prompt',
      'quiz.u4.q2.explain',
      (rng) => {
        const limit = Math.round(rng.range(15, 70) * 100) / 100;
        const qty = 100;
        const fee = 1;
        const answer = qty * limit + fee;
        return {
          params: { limit, qty, fee },
          paramKinds: { limit: 'money', qty: 'integer', fee: 'money' },
          answer: Math.round(answer * 100) / 100,
          tolerance: 0.02,
          answerFormat: 'money',
        };
      },
    ),
    single('u4-q3', 'quiz.u4.q3.prompt', TRUE_FALSE.map((o, i) => ({ ...o, correct: i === 1 })), 'quiz.u4.q3.explain'),
    multi(
      'u4-q4',
      'quiz.u4.q4.prompt',
      [
        { key: 'quiz.u4.q4.o1', correct: true },
        { key: 'quiz.u4.q4.o2', correct: true },
        { key: 'quiz.u4.q4.o3' },
        { key: 'quiz.u4.q4.o4', correct: true },
      ],
      'quiz.u4.q4.explain',
    ),
    single(
      'u4-q5',
      'quiz.u4.q5.prompt',
      [
        { key: 'quiz.u4.q5.o1' },
        { key: 'quiz.u4.q5.o2', correct: true },
        { key: 'quiz.u4.q5.o3' },
        { key: 'quiz.u4.q5.o4' },
      ],
      'quiz.u4.q5.explain',
    ),
    numeric(
      'u4-q6',
      'quiz.u4.q6.prompt',
      'quiz.u4.q6.explain',
      (rng) => {
        const bid = Math.round(rng.range(20, 80) * 100) / 100;
        const ask = Math.round((bid + rng.range(0.03, 0.18)) * 100) / 100;
        const qty = 50;
        const answer = (ask - bid) * qty;
        return {
          params: { bid, ask, qty },
          paramKinds: { bid: 'money', ask: 'money', qty: 'integer' },
          answer: Math.round(answer * 100) / 100,
          tolerance: 0.02,
          answerFormat: 'money',
        };
      },
    ),
  ],
  u5: [
    single(
      'u5-q1',
      'quiz.u5.q1.prompt',
      [
        { key: 'quiz.u5.q1.o1', correct: true },
        { key: 'quiz.u5.q1.o2' },
        { key: 'quiz.u5.q1.o3' },
        { key: 'quiz.u5.q1.o4' },
      ],
      'quiz.u5.q1.explain',
    ),
    numeric(
      'u5-q2',
      'quiz.u5.q2.prompt',
      'quiz.u5.q2.explain',
      (rng) => {
        const qty = Math.round(rng.range(50, 400) / 10) * 10;
        const perShare = Math.round(rng.range(0.2, 1.2) * 100) / 100;
        return {
          params: { qty, perShare },
          paramKinds: { qty: 'integer', perShare: 'money' },
          answer: Math.round(qty * perShare * 100) / 100,
          tolerance: 0.02,
          answerFormat: 'money',
        };
      },
    ),
    single(
      'u5-q3',
      'quiz.u5.q3.prompt',
      [
        { key: 'quiz.u5.q3.o1' },
        { key: 'quiz.u5.q3.o2', correct: true },
        { key: 'quiz.u5.q3.o3' },
        { key: 'quiz.u5.q3.o4' },
      ],
      'quiz.u5.q3.explain',
    ),
    multi(
      'u5-q4',
      'quiz.u5.q4.prompt',
      [
        { key: 'quiz.u5.q4.o1', correct: true },
        { key: 'quiz.u5.q4.o2', correct: true },
        { key: 'quiz.u5.q4.o3' },
        { key: 'quiz.u5.q4.o4', correct: true },
      ],
      'quiz.u5.q4.explain',
    ),
    single(
      'u5-q5',
      'quiz.u5.q5.prompt',
      [
        { key: 'quiz.u5.q5.o1' },
        { key: 'quiz.u5.q5.o2' },
        { key: 'quiz.u5.q5.o3', correct: true },
        { key: 'quiz.u5.q5.o4' },
      ],
      'quiz.u5.q5.explain',
    ),
    numeric(
      'u5-q6',
      'quiz.u5.q6.prompt',
      'quiz.u5.q6.explain',
      (rng) => {
        const price = Math.round(rng.range(20, 90) * 100) / 100;
        const annual = Math.round(rng.range(0.6, 3.6) * 100) / 100;
        return {
          params: { price, annual },
          paramKinds: { price: 'money', annual: 'money' },
          answer: Math.round((annual / price) * 10000) / 100,
          tolerance: 0.03,
          answerFormat: 'percent',
        };
      },
    ),
  ],
  u6: [
    single(
      'u6-q1',
      'quiz.u6.q1.prompt',
      [
        { key: 'quiz.u6.q1.o1', correct: true },
        { key: 'quiz.u6.q1.o2' },
        { key: 'quiz.u6.q1.o3' },
        { key: 'quiz.u6.q1.o4' },
      ],
      'quiz.u6.q1.explain',
    ),
    single(
      'u6-q2',
      'quiz.u6.q2.prompt',
      [
        { key: 'quiz.u6.q2.o1' },
        { key: 'quiz.u6.q2.o2', correct: true },
        { key: 'quiz.u6.q2.o3' },
        { key: 'quiz.u6.q2.o4' },
      ],
      'quiz.u6.q2.explain',
    ),
    single(
      'u6-q3',
      'quiz.u6.q3.prompt',
      [
        { key: 'quiz.u6.q3.o1' },
        { key: 'quiz.u6.q3.o2' },
        { key: 'quiz.u6.q3.o3', correct: true },
        { key: 'quiz.u6.q3.o4' },
      ],
      'quiz.u6.q3.explain',
    ),
    multi(
      'u6-q4',
      'quiz.u6.q4.prompt',
      [
        { key: 'quiz.u6.q4.o1', correct: true },
        { key: 'quiz.u6.q4.o2', correct: true },
        { key: 'quiz.u6.q4.o3' },
        { key: 'quiz.u6.q4.o4', correct: true },
      ],
      'quiz.u6.q4.explain',
    ),
  ],
  u7: [
    single(
      'u7-q1',
      'quiz.u7.q1.prompt',
      [
        { key: 'quiz.u7.q1.o1' },
        { key: 'quiz.u7.q1.o2', correct: true },
        { key: 'quiz.u7.q1.o3' },
        { key: 'quiz.u7.q1.o4' },
      ],
      'quiz.u7.q1.explain',
    ),
    single(
      'u7-q2',
      'quiz.u7.q2.prompt',
      [
        { key: 'quiz.u7.q2.o1', correct: true },
        { key: 'quiz.u7.q2.o2' },
        { key: 'quiz.u7.q2.o3' },
        { key: 'quiz.u7.q2.o4' },
      ],
      'quiz.u7.q2.explain',
    ),
    multi(
      'u7-q3',
      'quiz.u7.q3.prompt',
      [
        { key: 'quiz.u7.q3.o1', correct: true },
        { key: 'quiz.u7.q3.o2', correct: true },
        { key: 'quiz.u7.q3.o3' },
        { key: 'quiz.u7.q3.o4', correct: true },
      ],
      'quiz.u7.q3.explain',
    ),
    numeric(
      'u7-q4',
      'quiz.u7.q4.prompt',
      'quiz.u7.q4.explain',
      (rng) => {
        const weight = Math.round(rng.range(50, 80));
        const r1 = Math.round(rng.range(4, 18) * 10) / 10;
        const r2 = Math.round(rng.range(-12, 3) * 10) / 10;
        return {
          params: { weight, r1, r2 },
          paramKinds: { weight: 'number', r1: 'percent', r2: 'percent' },
          answer: Math.round((weight * r1 + (100 - weight) * r2) * 100) / 100,
          tolerance: 0.05,
          answerFormat: 'percent',
        };
      },
    ),
  ],
  u8: [
    single(
      'u8-q1',
      'quiz.u8.q1.prompt',
      [
        { key: 'quiz.u8.q1.o1' },
        { key: 'quiz.u8.q1.o2', correct: true },
        { key: 'quiz.u8.q1.o3' },
        { key: 'quiz.u8.q1.o4' },
      ],
      'quiz.u8.q1.explain',
    ),
    numeric(
      'u8-q2',
      'quiz.u8.q2.prompt',
      'quiz.u8.q2.explain',
      (rng) => {
        const principal = Math.round(rng.range(500, 3000) / 100) * 100;
        const rate = Math.round(rng.range(4, 12) * 10) / 10;
        const years = Math.round(rng.range(2, 5));
        const answer = principal * ((1 + rate / 100) ** years);
        return {
          params: { principal, rate, years },
          paramKinds: { principal: 'money', rate: 'percent', years: 'number' },
          answer: Math.round(answer * 100) / 100,
          tolerance: 0.02,
          answerFormat: 'money',
        };
      },
    ),
    single(
      'u8-q3',
      'quiz.u8.q3.prompt',
      [
        { key: 'quiz.u8.q3.o1' },
        { key: 'quiz.u8.q3.o2', correct: true },
        { key: 'quiz.u8.q3.o3' },
        { key: 'quiz.u8.q3.o4' },
      ],
      'quiz.u8.q3.explain',
    ),
    multi(
      'u8-q4',
      'quiz.u8.q4.prompt',
      [
        { key: 'quiz.u8.q4.o1', correct: true },
        { key: 'quiz.u8.q4.o2', correct: true },
        { key: 'quiz.u8.q4.o3', correct: true },
        { key: 'quiz.u8.q4.o4' },
      ],
      'quiz.u8.q4.explain',
    ),
  ],
  u9: [
    single(
      'u9-q1',
      'quiz.u9.q1.prompt',
      [
        { key: 'quiz.u9.q1.o1', correct: true },
        { key: 'quiz.u9.q1.o2' },
        { key: 'quiz.u9.q1.o3' },
        { key: 'quiz.u9.q1.o4' },
      ],
      'quiz.u9.q1.explain',
    ),
    single(
      'u9-q2',
      'quiz.u9.q2.prompt',
      [
        { key: 'quiz.u9.q2.o1' },
        { key: 'quiz.u9.q2.o2', correct: true },
        { key: 'quiz.u9.q2.o3' },
        { key: 'quiz.u9.q2.o4' },
      ],
      'quiz.u9.q2.explain',
    ),
    multi(
      'u9-q3',
      'quiz.u9.q3.prompt',
      [
        { key: 'quiz.u9.q3.o1', correct: true },
        { key: 'quiz.u9.q3.o2', correct: true },
        { key: 'quiz.u9.q3.o3' },
        { key: 'quiz.u9.q3.o4', correct: true },
      ],
      'quiz.u9.q3.explain',
    ),
    numeric(
      'u9-q4',
      'quiz.u9.q4.prompt',
      'quiz.u9.q4.explain',
      (rng) => {
        const open = Math.round(rng.range(20, 80) * 100) / 100;
        const close = Math.round((open + rng.range(-3, 3)) * 100) / 100;
        return {
          params: { open, close },
          paramKinds: { open: 'money', close: 'money' },
          answer: Math.abs(close - open),
          tolerance: 0.02,
          answerFormat: 'money',
        };
      },
    ),
  ],
  u10: [
    single(
      'u10-q1',
      'quiz.u10.q1.prompt',
      [
        { key: 'quiz.u10.q1.o1', correct: true },
        { key: 'quiz.u10.q1.o2' },
        { key: 'quiz.u10.q1.o3' },
        { key: 'quiz.u10.q1.o4' },
      ],
      'quiz.u10.q1.explain',
    ),
    single(
      'u10-q2',
      'quiz.u10.q2.prompt',
      [
        { key: 'quiz.u10.q2.o1' },
        { key: 'quiz.u10.q2.o2' },
        { key: 'quiz.u10.q2.o3', correct: true },
        { key: 'quiz.u10.q2.o4' },
      ],
      'quiz.u10.q2.explain',
    ),
    multi(
      'u10-q3',
      'quiz.u10.q3.prompt',
      [
        { key: 'quiz.u10.q3.o1', correct: true },
        { key: 'quiz.u10.q3.o2', correct: true },
        { key: 'quiz.u10.q3.o3' },
        { key: 'quiz.u10.q3.o4', correct: true },
      ],
      'quiz.u10.q3.explain',
    ),
    numeric(
      'u10-q4',
      'quiz.u10.q4.prompt',
      'quiz.u10.q4.explain',
      (rng) => {
        const base = Math.round(rng.range(10, 60) * 100) / 100;
        const values = [base, base + 2, base + 4];
        return {
          params: { p1: values[0], p2: values[1], p3: values[2] },
          paramKinds: { p1: 'money', p2: 'money', p3: 'money' },
          answer: Math.round(((base + base + 2 + base + 4) / 3) * 100) / 100,
          tolerance: 0.02,
          answerFormat: 'money',
        };
      },
    ),
  ],
  u11: [
    single(
      'u11-q1',
      'quiz.u11.q1.prompt',
      [
        { key: 'quiz.u11.q1.o1', correct: true },
        { key: 'quiz.u11.q1.o2' },
        { key: 'quiz.u11.q1.o3' },
        { key: 'quiz.u11.q1.o4' },
      ],
      'quiz.u11.q1.explain',
    ),
    single(
      'u11-q2',
      'quiz.u11.q2.prompt',
      [
        { key: 'quiz.u11.q2.o1' },
        { key: 'quiz.u11.q2.o2', correct: true },
        { key: 'quiz.u11.q2.o3' },
        { key: 'quiz.u11.q2.o4' },
      ],
      'quiz.u11.q2.explain',
    ),
    multi(
      'u11-q3',
      'quiz.u11.q3.prompt',
      [
        { key: 'quiz.u11.q3.o1', correct: true },
        { key: 'quiz.u11.q3.o2', correct: true },
        { key: 'quiz.u11.q3.o3' },
        { key: 'quiz.u11.q3.o4', correct: true },
      ],
      'quiz.u11.q3.explain',
    ),
    numeric(
      'u11-q4',
      'quiz.u11.q4.prompt',
      'quiz.u11.q4.explain',
      (rng) => {
        const revenue = Math.round(rng.range(500, 3000) / 10) * 10;
        const cogs = Math.round(revenue * rng.range(0.4, 0.7));
        return {
          params: { revenue, cogs },
          paramKinds: { revenue: 'millions', cogs: 'millions' },
          answer: revenue - cogs,
          tolerance: 1,
          answerFormat: 'millions',
        };
      },
    ),
  ],
  u12: [
    single(
      'u12-q1',
      'quiz.u12.q1.prompt',
      [
        { key: 'quiz.u12.q1.o1' },
        { key: 'quiz.u12.q1.o2', correct: true },
        { key: 'quiz.u12.q1.o3' },
        { key: 'quiz.u12.q1.o4' },
      ],
      'quiz.u12.q1.explain',
    ),
    single(
      'u12-q2',
      'quiz.u12.q2.prompt',
      [
        { key: 'quiz.u12.q2.o1', correct: true },
        { key: 'quiz.u12.q2.o2' },
        { key: 'quiz.u12.q2.o3' },
        { key: 'quiz.u12.q2.o4' },
      ],
      'quiz.u12.q2.explain',
    ),
    multi(
      'u12-q3',
      'quiz.u12.q3.prompt',
      [
        { key: 'quiz.u12.q3.o1', correct: true },
        { key: 'quiz.u12.q3.o2', correct: true },
        { key: 'quiz.u12.q3.o3' },
        { key: 'quiz.u12.q3.o4', correct: true },
      ],
      'quiz.u12.q3.explain',
    ),
    numeric(
      'u12-q4',
      'quiz.u12.q4.prompt',
      'quiz.u12.q4.explain',
      (rng) => {
        const fcf = Math.round(rng.range(50, 500) / 10) * 10;
        const discount = Math.round(rng.range(8, 15) * 10) / 10;
        return {
          params: { fcf, discount },
          paramKinds: { fcf: 'millions', discount: 'percent' },
          answer: Math.round((fcf / (1 + discount / 100)) * 100) / 100,
          tolerance: 0.05,
          answerFormat: 'millions',
        };
      },
    ),
  ],
  u13: [
    single(
      'u13-q1',
      'quiz.u13.q1.prompt',
      [
        { key: 'quiz.u13.q1.o1', correct: true },
        { key: 'quiz.u13.q1.o2' },
        { key: 'quiz.u13.q1.o3' },
        { key: 'quiz.u13.q1.o4' },
      ],
      'quiz.u13.q1.explain',
    ),
    single(
      'u13-q2',
      'quiz.u13.q2.prompt',
      [
        { key: 'quiz.u13.q2.o1' },
        { key: 'quiz.u13.q2.o2', correct: true },
        { key: 'quiz.u13.q2.o3' },
        { key: 'quiz.u13.q2.o4' },
      ],
      'quiz.u13.q2.explain',
    ),
    multi(
      'u13-q3',
      'quiz.u13.q3.prompt',
      [
        { key: 'quiz.u13.q3.o1', correct: true },
        { key: 'quiz.u13.q3.o2', correct: true },
        { key: 'quiz.u13.q3.o3' },
        { key: 'quiz.u13.q3.o4', correct: true },
      ],
      'quiz.u13.q3.explain',
    ),
    single(
      'u13-q4',
      'quiz.u13.q4.prompt',
      [
        { key: 'quiz.u13.q4.o1' },
        { key: 'quiz.u13.q4.o2' },
        { key: 'quiz.u13.q4.o3', correct: true },
        { key: 'quiz.u13.q4.o4' },
      ],
      'quiz.u13.q4.explain',
    ),
  ],
  u14: [
    single(
      'u14-q1',
      'quiz.u14.q1.prompt',
      [
        { key: 'quiz.u14.q1.o1', correct: true },
        { key: 'quiz.u14.q1.o2' },
        { key: 'quiz.u14.q1.o3' },
        { key: 'quiz.u14.q1.o4' },
      ],
      'quiz.u14.q1.explain',
    ),
    single(
      'u14-q2',
      'quiz.u14.q2.prompt',
      [
        { key: 'quiz.u14.q2.o1' },
        { key: 'quiz.u14.q2.o2' },
        { key: 'quiz.u14.q2.o3', correct: true },
        { key: 'quiz.u14.q2.o4' },
      ],
      'quiz.u14.q2.explain',
    ),
    multi(
      'u14-q3',
      'quiz.u14.q3.prompt',
      [
        { key: 'quiz.u14.q3.o1', correct: true },
        { key: 'quiz.u14.q3.o2', correct: true },
        { key: 'quiz.u14.q3.o3' },
        { key: 'quiz.u14.q3.o4', correct: true },
      ],
      'quiz.u14.q3.explain',
    ),
    numeric(
      'u14-q4',
      'quiz.u14.q4.prompt',
      'quiz.u14.q4.explain',
      (rng) => {
        const stock = Math.round(rng.range(40, 80));
        const stockReturn = Math.round(rng.range(6, 18) * 10) / 10;
        const bondReturn = Math.round(rng.range(1, 5) * 10) / 10;
        return {
          params: { stock, stockReturn, bondReturn },
          paramKinds: { stock: 'number', stockReturn: 'percent', bondReturn: 'percent' },
          answer: Math.round((stock * stockReturn + (100 - stock) * bondReturn) * 100) / 100,
          tolerance: 0.05,
          answerFormat: 'percent',
        };
      },
    ),
  ],
  u15: [
    single(
      'u15-q1',
      'quiz.u15.q1.prompt',
      [
        { key: 'quiz.u15.q1.o1', correct: true },
        { key: 'quiz.u15.q1.o2' },
        { key: 'quiz.u15.q1.o3' },
        { key: 'quiz.u15.q1.o4' },
      ],
      'quiz.u15.q1.explain',
    ),
    single(
      'u15-q2',
      'quiz.u15.q2.prompt',
      [
        { key: 'quiz.u15.q2.o1' },
        { key: 'quiz.u15.q2.o2', correct: true },
        { key: 'quiz.u15.q2.o3' },
        { key: 'quiz.u15.q2.o4' },
      ],
      'quiz.u15.q2.explain',
    ),
    multi(
      'u15-q3',
      'quiz.u15.q3.prompt',
      [
        { key: 'quiz.u15.q3.o1', correct: true },
        { key: 'quiz.u15.q3.o2', correct: true },
        { key: 'quiz.u15.q3.o3' },
        { key: 'quiz.u15.q3.o4', correct: true },
      ],
      'quiz.u15.q3.explain',
    ),
    numeric(
      'u15-q4',
      'quiz.u15.q4.prompt',
      'quiz.u15.q4.explain',
      (rng) => {
        const account = Math.round(rng.range(5000, 20000) / 100) * 100;
        const risk = Math.round(rng.range(0.5, 2) * 10) / 10;
        const entry = Math.round(rng.range(20, 80) * 100) / 100;
        const stop = Math.round((entry - rng.range(2, 8)) * 100) / 100;
        const perShare = Math.max(0.01, entry - stop);
        return {
          params: { account, risk, entry, stop },
          paramKinds: { account: 'money', risk: 'percent', entry: 'money', stop: 'money' },
          answer: Math.floor((account * risk / 100) / perShare),
          tolerance: 0,
          answerFormat: 'integer',
        };
      },
    ),
  ],
  u16: [
    single(
      'u16-q1',
      'quiz.u16.q1.prompt',
      [
        { key: 'quiz.u16.q1.o1', correct: true },
        { key: 'quiz.u16.q1.o2' },
        { key: 'quiz.u16.q1.o3' },
        { key: 'quiz.u16.q1.o4' },
      ],
      'quiz.u16.q1.explain',
    ),
    single(
      'u16-q2',
      'quiz.u16.q2.prompt',
      [
        { key: 'quiz.u16.q2.o1' },
        { key: 'quiz.u16.q2.o2', correct: true },
        { key: 'quiz.u16.q2.o3' },
        { key: 'quiz.u16.q2.o4' },
      ],
      'quiz.u16.q2.explain',
    ),
    multi(
      'u16-q3',
      'quiz.u16.q3.prompt',
      [
        { key: 'quiz.u16.q3.o1', correct: true },
        { key: 'quiz.u16.q3.o2', correct: true },
        { key: 'quiz.u16.q3.o3' },
        { key: 'quiz.u16.q3.o4', correct: true },
      ],
      'quiz.u16.q3.explain',
    ),
    single(
      'u16-q4',
      'quiz.u16.q4.prompt',
      [
        { key: 'quiz.u16.q4.o1' },
        { key: 'quiz.u16.q4.o2' },
        { key: 'quiz.u16.q4.o3' },
        { key: 'quiz.u16.q4.o4', correct: true },
      ],
      'quiz.u16.q4.explain',
    ),
  ],
  u17: [
    single(
      'u17-q1',
      'quiz.u17.q1.prompt',
      [
        { key: 'quiz.u17.q1.o1' },
        { key: 'quiz.u17.q1.o2', correct: true },
        { key: 'quiz.u17.q1.o3' },
        { key: 'quiz.u17.q1.o4' },
      ],
      'quiz.u17.q1.explain',
    ),
    single(
      'u17-q2',
      'quiz.u17.q2.prompt',
      [
        { key: 'quiz.u17.q2.o1' },
        { key: 'quiz.u17.q2.o2' },
        { key: 'quiz.u17.q2.o3', correct: true },
        { key: 'quiz.u17.q2.o4' },
      ],
      'quiz.u17.q2.explain',
    ),
    multi(
      'u17-q3',
      'quiz.u17.q3.prompt',
      [
        { key: 'quiz.u17.q3.o1', correct: true },
        { key: 'quiz.u17.q3.o2', correct: true },
        { key: 'quiz.u17.q3.o3' },
        { key: 'quiz.u17.q3.o4', correct: true },
      ],
      'quiz.u17.q3.explain',
    ),
    numeric('u17-q4', 'quiz.u17.q4.prompt', 'quiz.u17.q4.explain', (rng) => {
      const qty = Math.round(rng.range(10, 50));
      const entry = Math.round(rng.range(30, 90) * 100) / 100;
      const exit = Math.round((entry - rng.range(3, 15)) * 100) / 100;
      return {
        params: { qty, entry, exit },
        paramKinds: { qty: 'integer', entry: 'money', exit: 'money' },
        answer: Math.round((entry - exit) * qty * 100) / 100,
        tolerance: 0.05,
        answerFormat: 'money',
      };
    }),
  ],
  u18: [
    single(
      'u18-q1',
      'quiz.u18.q1.prompt',
      [
        { key: 'quiz.u18.q1.o1' },
        { key: 'quiz.u18.q1.o2', correct: true },
        { key: 'quiz.u18.q1.o3' },
        { key: 'quiz.u18.q1.o4' },
      ],
      'quiz.u18.q1.explain',
    ),
    single(
      'u18-q2',
      'quiz.u18.q2.prompt',
      [
        { key: 'quiz.u18.q2.o1' },
        { key: 'quiz.u18.q2.o2' },
        { key: 'quiz.u18.q2.o3' },
        { key: 'quiz.u18.q2.o4', correct: true },
      ],
      'quiz.u18.q2.explain',
    ),
    multi(
      'u18-q3',
      'quiz.u18.q3.prompt',
      [
        { key: 'quiz.u18.q3.o1', correct: true },
        { key: 'quiz.u18.q3.o2', correct: true },
        { key: 'quiz.u18.q3.o3' },
        { key: 'quiz.u18.q3.o4', correct: true },
      ],
      'quiz.u18.q3.explain',
    ),
    numeric('u18-q4', 'quiz.u18.q4.prompt', 'quiz.u18.q4.explain', (rng) => {
      const debit = Math.round(rng.range(2000, 20000) / 100) * 100;
      return {
        params: { debit },
        paramKinds: { debit: 'money' },
        answer: Math.round(debit * 0.08 / 252 * 100) / 100,
        tolerance: 0.02,
        answerFormat: 'money',
      };
    }),
  ],
  u19: [
    single(
      'u19-q1',
      'quiz.u19.q1.prompt',
      [
        { key: 'quiz.u19.q1.o1', correct: true },
        { key: 'quiz.u19.q1.o2' },
        { key: 'quiz.u19.q1.o3' },
        { key: 'quiz.u19.q1.o4' },
      ],
      'quiz.u19.q1.explain',
    ),
    single(
      'u19-q2',
      'quiz.u19.q2.prompt',
      [
        { key: 'quiz.u19.q2.o1' },
        { key: 'quiz.u19.q2.o2' },
        { key: 'quiz.u19.q2.o3', correct: true },
        { key: 'quiz.u19.q2.o4' },
      ],
      'quiz.u19.q2.explain',
    ),
    multi(
      'u19-q3',
      'quiz.u19.q3.prompt',
      [
        { key: 'quiz.u19.q3.o1', correct: true },
        { key: 'quiz.u19.q3.o2', correct: true },
        { key: 'quiz.u19.q3.o3' },
        { key: 'quiz.u19.q3.o4', correct: true },
      ],
      'quiz.u19.q3.explain',
    ),
    numeric('u19-q4', 'quiz.u19.q4.prompt', 'quiz.u19.q4.explain', (rng) => {
      const entry = Math.round(rng.range(40, 150) * 100) / 100;
      const trail = Math.round(rng.range(3, 12) * 100) / 100;
      return {
        params: { entry, trail },
        paramKinds: { entry: 'money', trail: 'money' },
        answer: Math.round((entry - trail) * 100) / 100,
        tolerance: 0.02,
        answerFormat: 'money',
      };
    }),
  ],
  u20: [
    single(
      'u20-q1',
      'quiz.u20.q1.prompt',
      [
        { key: 'quiz.u20.q1.o1' },
        { key: 'quiz.u20.q1.o2', correct: true },
        { key: 'quiz.u20.q1.o3' },
        { key: 'quiz.u20.q1.o4' },
      ],
      'quiz.u20.q1.explain',
    ),
    single(
      'u20-q2',
      'quiz.u20.q2.prompt',
      [
        { key: 'quiz.u20.q2.o1', correct: true },
        { key: 'quiz.u20.q2.o2' },
        { key: 'quiz.u20.q2.o3' },
        { key: 'quiz.u20.q2.o4' },
      ],
      'quiz.u20.q2.explain',
    ),
    multi(
      'u20-q3',
      'quiz.u20.q3.prompt',
      [
        { key: 'quiz.u20.q3.o1', correct: true },
        { key: 'quiz.u20.q3.o2', correct: true },
        { key: 'quiz.u20.q3.o3' },
        { key: 'quiz.u20.q3.o4', correct: true },
      ],
      'quiz.u20.q3.explain',
    ),
    numeric('u20-q4', 'quiz.u20.q4.prompt', 'quiz.u20.q4.explain', (rng) => {
      const best = Math.round(rng.range(20, 90) * 100) / 100;
      const size1 = Math.round(rng.range(100, 400) / 10) * 10;
      const size2 = Math.round(rng.range(100, 400) / 10) * 10;
      const qty = size1 + Math.floor(size2 / 2);
      const second = Math.round((best + 0.05) * 100) / 100;
      const answer = Math.round((size1 * best + Math.floor(size2 / 2) * second) / qty * 100) / 100;
      return {
        params: {
          best, size1, size2, qty, second,
        },
        paramKinds: {
          best: 'money', size1: 'integer', size2: 'integer', qty: 'integer', second: 'money',
        },
        answer,
        tolerance: 0.02,
        answerFormat: 'money',
      };
    }),
  ],
};
export function buildQuizSession(unitId, attempt = 1) {
  const bank = QUIZ_BANKS[unitId];
  if (!bank) return null;
  const rng = createRng(`quiz:${unitId}:${attempt}`);
  const questions = bank.map((spec) => {
    const built = spec.build(rng);
    const options = built.options ? rng.shuffle(built.options).map(({ key }) => ({ key })) : [];
    return {
      id: spec.id,
      ...built,
      options,
    };
  });
  return { unitId, attempt, questions, passScore: PASS_SCORE };
}

function normalize(value) {
  if (Array.isArray(value)) return [...value].sort();
  return value;
}

export function gradeQuiz(session, answers = {}) {
  const details = session.questions.map((question) => {
    const given = answers[question.id];
    let correct = false;
    if (question.type === 'numeric') {
      const value = Number(given);
      const hasValue = given !== '' && given !== null && given !== undefined && Number.isFinite(value);
      correct = hasValue && Math.abs(value - question.answer) <= (question.tolerance ?? 0.01);
    } else if (question.type === 'multi') {
      const selected = Array.isArray(given) ? given : [];
      const expected = question.correctIds;
      correct = selected.length === expected.length
        && normalize(selected).join('|') === normalize(expected).join('|');
    } else {
      correct = given === question.correctIds[0];
    }
    return {
      id: question.id,
      type: question.type,
      correct,
      given,
      expected: question.type === 'numeric' ? question.answer : question.correctIds,
    };
  });

  const correctCount = details.filter((d) => d.correct).length;
  const total = session.questions.length;
  const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  return {
    score,
    correctCount,
    total,
    passed: score >= session.passScore,
    testOutPassed: score >= TEST_OUT_SCORE,
    details,
  };
}

export function questionXp(score, firstPass, perfect) {
  let xp = 0;
  if (firstPass) xp += 40;
  if (perfect) xp += 15;
  return xp;
}
