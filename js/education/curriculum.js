/**
 * Curriculum definition: stages, units, lesson sections, practice tasks and unlocks.
 * Stages 1-5 (Unit 1-20) are fully implemented. Later stages are intentionally
 * declared as `implemented: false` so the game never pretends they are playable.
 */

const p = (key) => ({ type: 'p', key });
const list = (titleKey, items, variant = 'plain') => ({ type: 'list', titleKey, items, variant });
const callout = (variant, titleKey, key) => ({ type: 'callout', variant, titleKey, key });
const formula = (key, noteKey) => ({ type: 'formula', key, noteKey });
const example = (titleKey, lines) => ({ type: 'example', titleKey, lines });
const term = (termId) => ({ type: 'term', termId });
const demo = (id) => ({ type: 'demo', id });
const table = (headKeys, rows) => ({ type: 'table', headKeys, rows });

const UNIT_1 = {
  id: 'u1',
  number: 1,
  stageId: 'stage1',
  implemented: true,
  titleKey: 'curriculum.u1.title',
  summaryKey: 'curriculum.u1.summary',
  minutes: 14,
  prerequisites: [],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u1.s1.title',
      blocks: [
        p('lesson.u1.s1.p1'),
        p('lesson.u1.s1.p2'),
        callout('key', 'lesson.u1.s1.key.title', 'lesson.u1.s1.key.text'),
        term('stock'),
        formula('lesson.u1.s1.f1', 'lesson.u1.s1.f1note'),
        example('lesson.u1.s1.example.title', ['lesson.u1.s1.example.l1', 'lesson.u1.s1.example.l2']),
        callout('myth', 'lesson.u1.s1.myth.title', 'lesson.u1.s1.myth.text'),
        callout('pro', 'lesson.u1.s1.pro.title', 'lesson.u1.s1.pro.text'),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u1.s2.title',
      blocks: [
        p('lesson.u1.s2.p1'),
        p('lesson.u1.s2.p2'),
        list('lesson.u1.s2.list.title', [
          'lesson.u1.s2.list.i1',
          'lesson.u1.s2.list.i2',
          'lesson.u1.s2.list.i3',
          'lesson.u1.s2.list.i4',
        ], 'check'),
        term('shareholder'),
        callout('pro', 'lesson.u1.s2.pro.title', 'lesson.u1.s2.pro.text'),
        callout('myth', 'lesson.u1.s2.myth.title', 'lesson.u1.s2.myth.text'),
        callout('tip', 'lesson.u1.s2.tip.title', 'lesson.u1.s2.tip.text'),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u1.s3.title',
      blocks: [
        p('lesson.u1.s3.p1'),
        p('lesson.u1.s3.p2'),
        list('lesson.u1.s3.list.title', [
          'lesson.u1.s3.list.i1',
          'lesson.u1.s3.list.i2',
          'lesson.u1.s3.list.i3',
          'lesson.u1.s3.list.i4',
        ]),
        term('ticker'),
        example('lesson.u1.s3.example.title', ['lesson.u1.s3.example.l1', 'lesson.u1.s3.example.l2']),
        callout('warning', 'lesson.u1.s3.warn.title', 'lesson.u1.s3.warn.text'),
      ],
    },
    {
      id: 's4',
      titleKey: 'lesson.u1.s4.title',
      blocks: [
        p('lesson.u1.s4.p1'),
        p('lesson.u1.s4.p2'),
        callout('key', 'lesson.u1.s4.key.title', 'lesson.u1.s4.key.text'),
        formula('lesson.u1.s4.f1', 'lesson.u1.s4.f1note'),
        demo('marketCap'),
        example('lesson.u1.s4.example.title', ['lesson.u1.s4.example.l1', 'lesson.u1.s4.example.l2']),
        term('marketCap'),
        callout('warning', 'lesson.u1.s4.warn.title', 'lesson.u1.s4.warn.text'),
        callout('tip', 'lesson.u1.s4.tip.title', 'lesson.u1.s4.tip.text'),
      ],
    },
  ],
  practice: {
    id: 'u1-p1',
    check: 'inspect-companies',
    target: 2,
    titleKey: 'practice.u1.title',
    requirementKey: 'practice.u1.requirement',
    hintKey: 'practice.u1.hint',
    actionKey: 'practice.u1.action',
    actionHref: '#/market',
  },
  quiz: { id: 'u1', passScore: 80 },
};

const UNIT_2 = {
  id: 'u2',
  number: 2,
  stageId: 'stage1',
  implemented: true,
  titleKey: 'curriculum.u2.title',
  summaryKey: 'curriculum.u2.summary',
  minutes: 14,
  prerequisites: ['u1'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u2.s1.title',
      blocks: [
        p('lesson.u2.s1.p1'),
        p('lesson.u2.s1.p2'),
        term('broker'),
        list('lesson.u2.s1.list.title', [
          'lesson.u2.s1.list.i1',
          'lesson.u2.s1.list.i2',
          'lesson.u2.s1.list.i3',
          'lesson.u2.s1.list.i4',
          'lesson.u2.s1.list.i5',
        ], 'number'),
        example('lesson.u2.s1.example.title', ['lesson.u2.s1.example.l1', 'lesson.u2.s1.example.l2']),
        callout('myth', 'lesson.u2.s1.myth.title', 'lesson.u2.s1.myth.text'),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u2.s2.title',
      blocks: [
        p('lesson.u2.s2.p1'),
        p('lesson.u2.s2.p2'),
        callout('key', 'lesson.u2.s2.key.title', 'lesson.u2.s2.key.text'),
        formula('lesson.u2.s2.f1'),
        example('lesson.u2.s2.example.title', ['lesson.u2.s2.example.l1', 'lesson.u2.s2.example.l2']),
        callout('warning', 'lesson.u2.s2.warn.title', 'lesson.u2.s2.warn.text'),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u2.s3.title',
      blocks: [
        p('lesson.u2.s3.p1'),
        p('lesson.u2.s3.p2'),
        term('marketOrder'),
        list('lesson.u2.s3.list.title', [
          'lesson.u2.s3.list.i1',
          'lesson.u2.s3.list.i2',
          'lesson.u2.s3.list.i3',
        ]),
        example('lesson.u2.s3.example.title', ['lesson.u2.s3.example.l1', 'lesson.u2.s3.example.l2']),
        callout('warning', 'lesson.u2.s3.warn.title', 'lesson.u2.s3.warn.text'),
      ],
    },
    {
      id: 's4',
      titleKey: 'lesson.u2.s4.title',
      blocks: [
        p('lesson.u2.s4.p1'),
        p('lesson.u2.s4.p2'),
        term('bid'),
        term('ask'),
        term('spread'),
        formula('lesson.u2.s4.f1'),
        demo('spread'),
        example('lesson.u2.s4.example.title', ['lesson.u2.s4.example.l1', 'lesson.u2.s4.example.l2']),
        callout('tip', 'lesson.u2.s4.tip.title', 'lesson.u2.s4.tip.text'),
      ],
    },
  ],
  practice: {
    id: 'u2-p1',
    check: 'buy-under-budget',
    target: 1000,
    titleKey: 'practice.u2.title',
    requirementKey: 'practice.u2.requirement',
    hintKey: 'practice.u2.hint',
    actionKey: 'practice.u2.action',
    actionHref: '#/market',
  },
  quiz: { id: 'u2', passScore: 80 },
};

const UNIT_3 = {
  id: 'u3',
  number: 3,
  stageId: 'stage1',
  implemented: true,
  titleKey: 'curriculum.u3.title',
  summaryKey: 'curriculum.u3.summary',
  minutes: 16,
  prerequisites: ['u2'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u3.s1.title',
      blocks: [
        p('lesson.u3.s1.p1'),
        p('lesson.u3.s1.p2'),
        term('costBasis'),
        formula('lesson.u3.s1.f1'),
        demo('pnl'),
        example('lesson.u3.s1.example.title', ['lesson.u3.s1.example.l1', 'lesson.u3.s1.example.l2', 'lesson.u3.s1.example.l3']),
        callout('warning', 'lesson.u3.s1.warn.title', 'lesson.u3.s1.warn.text'),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u3.s2.title',
      blocks: [
        p('lesson.u3.s2.p1'),
        p('lesson.u3.s2.p2'),
        term('unrealizedPnl'),
        term('realizedPnl'),
        callout('key', 'lesson.u3.s2.key.title', 'lesson.u3.s2.key.text'),
        example('lesson.u3.s2.example.title', ['lesson.u3.s2.example.l1', 'lesson.u3.s2.example.l2', 'lesson.u3.s2.example.l3']),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u3.s3.title',
      blocks: [
        p('lesson.u3.s3.p1'),
        p('lesson.u3.s3.p2'),
        formula('lesson.u3.s3.f1'),
        example('lesson.u3.s3.example.title', ['lesson.u3.s3.example.l1', 'lesson.u3.s3.example.l2']),
        callout('tip', 'lesson.u3.s3.tip.title', 'lesson.u3.s3.tip.text'),
      ],
    },
    {
      id: 's4',
      titleKey: 'lesson.u3.s4.title',
      blocks: [
        p('lesson.u3.s4.p1'),
        p('lesson.u3.s4.p2'),
        term('commission'),
        formula('lesson.u3.s4.f1'),
        example('lesson.u3.s4.example.title', ['lesson.u3.s4.example.l1', 'lesson.u3.s4.example.l2']),
        callout('warning', 'lesson.u3.s4.warn.title', 'lesson.u3.s4.warn.text'),
      ],
    },
  ],
  practice: {
    id: 'u3-p1',
    check: 'round-trip',
    target: 1,
    titleKey: 'practice.u3.title',
    requirementKey: 'practice.u3.requirement',
    hintKey: 'practice.u3.hint',
    actionKey: 'practice.u3.action',
    actionHref: '#/portfolio',
  },
  quiz: { id: 'u3', passScore: 80 },
};

const UNIT_4 = {
  id: 'u4',
  number: 4,
  stageId: 'stage1',
  implemented: true,
  titleKey: 'curriculum.u4.title',
  summaryKey: 'curriculum.u4.summary',
  minutes: 16,
  prerequisites: ['u3'],
  unlocks: ['order.limit'],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u4.s1.title',
      blocks: [
        p('lesson.u4.s1.p1'),
        p('lesson.u4.s1.p2'),
        list('lesson.u4.s1.list.title', [
          'lesson.u4.s1.list.i1',
          'lesson.u4.s1.list.i2',
          'lesson.u4.s1.list.i3',
          'lesson.u4.s1.list.i4',
        ]),
        callout('warning', 'lesson.u4.s1.warn.title', 'lesson.u4.s1.warn.text'),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u4.s2.title',
      blocks: [
        p('lesson.u4.s2.p1'),
        p('lesson.u4.s2.p2'),
        list('lesson.u4.s2.list.title', [
          'lesson.u4.s2.list.i1',
          'lesson.u4.s2.list.i2',
          'lesson.u4.s2.list.i3',
          'lesson.u4.s2.list.i4',
        ]),
        example('lesson.u4.s2.example.title', ['lesson.u4.s2.example.l1', 'lesson.u4.s2.example.l2']),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u4.s3.title',
      blocks: [
        p('lesson.u4.s3.p1'),
        p('lesson.u4.s3.p2'),
        term('limitOrder'),
        formula('lesson.u4.s3.f1'),
        example('lesson.u4.s3.example.title', ['lesson.u4.s3.example.l1', 'lesson.u4.s3.example.l2']),
        list('lesson.u4.s3.list.title', [
          'lesson.u4.s3.list.i1',
          'lesson.u4.s3.list.i2',
        ]),
        callout('warning', 'lesson.u4.s3.warn.title', 'lesson.u4.s3.warn.text'),
        // Reading this section unlocks limit orders (checked by unlockManager).
      ],
    },
    {
      id: 's4',
      titleKey: 'lesson.u4.s4.title',
      blocks: [
        p('lesson.u4.s4.p1'),
        p('lesson.u4.s4.p2'),
        p('lesson.u4.s4.p3'),
        term('liquidity'),
        term('slippage'),
        demo('limitOrder'),
        table(
          ['lesson.u4.s4.table.h1', 'lesson.u4.s4.table.h2'],
          [
            ['lesson.u4.s4.table.r1c1', 'lesson.u4.s4.table.r1c2'],
            ['lesson.u4.s4.table.r2c1', 'lesson.u4.s4.table.r2c2'],
            ['lesson.u4.s4.table.r3c1', 'lesson.u4.s4.table.r3c2'],
            ['lesson.u4.s4.table.r4c1', 'lesson.u4.s4.table.r4c2'],
          ],
        ),
        callout('tip', 'lesson.u4.s4.tip.title', 'lesson.u4.s4.tip.text'),
      ],
    },
  ],
  practice: {
    id: 'u4-p1',
    check: 'limit-fill',
    target: 1,
    titleKey: 'practice.u4.title',
    requirementKey: 'practice.u4.requirement',
    hintKey: 'practice.u4.hint',
    actionKey: 'practice.u4.action',
    actionHref: '#/market',
  },
  quiz: { id: 'u4', passScore: 80 },
};

const UNIT_5 = {
  id: 'u5',
  number: 5,
  stageId: 'stage2',
  implemented: true,
  titleKey: 'curriculum.u5.title',
  summaryKey: 'curriculum.u5.summary',
  minutes: 15,
  prerequisites: ['u4'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u5.s1.title',
      blocks: [
        p('lesson.u5.s1.p1'),
        p('lesson.u5.s1.p2'),
        term('dividend'),
        formula('lesson.u5.s1.f1', 'lesson.u5.s1.f1note'),
        example('lesson.u5.s1.example.title', ['lesson.u5.s1.example.l1', 'lesson.u5.s1.example.l2']),
        callout('key', 'lesson.u5.s1.key.title', 'lesson.u5.s1.key.text'),
        callout('myth', 'lesson.u5.s1.myth.title', 'lesson.u5.s1.myth.text'),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u5.s2.title',
      blocks: [
        p('lesson.u5.s2.p1'),
        p('lesson.u5.s2.p2'),
        term('dividendYield'),
        formula('lesson.u5.s2.f1', 'lesson.u5.s2.f1note'),
        example('lesson.u5.s2.example.title', ['lesson.u5.s2.example.l1', 'lesson.u5.s2.example.l2']),
        list('lesson.u5.s2.list.title', [
          'lesson.u5.s2.list.i1',
          'lesson.u5.s2.list.i2',
          'lesson.u5.s2.list.i3',
        ]),
        callout('warning', 'lesson.u5.s2.warn.title', 'lesson.u5.s2.warn.text'),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u5.s3.title',
      blocks: [
        p('lesson.u5.s3.p1'),
        p('lesson.u5.s3.p2'),
        term('exDividendDate'),
        example('lesson.u5.s3.example.title', ['lesson.u5.s3.example.l1', 'lesson.u5.s3.example.l2']),
        demo('dividend'),
        callout('warning', 'lesson.u5.s3.warn.title', 'lesson.u5.s3.warn.text'),
        callout('tip', 'lesson.u5.s3.tip.title', 'lesson.u5.s3.tip.text'),
      ],
    },
    {
      id: 's4',
      titleKey: 'lesson.u5.s4.title',
      blocks: [
        p('lesson.u5.s4.p1'),
        p('lesson.u5.s4.p2'),
        term('payoutRatio'),
        formula('lesson.u5.s4.f1', 'lesson.u5.s4.f1note'),
        example('lesson.u5.s4.example.title', ['lesson.u5.s4.example.l1', 'lesson.u5.s4.example.l2']),
        callout('pro', 'lesson.u5.s4.pro.title', 'lesson.u5.s4.pro.text'),
        callout('warning', 'lesson.u5.s4.warn.title', 'lesson.u5.s4.warn.text'),
      ],
    },
  ],
  practice: {
    id: 'u5-p1',
    check: 'inspect-dividend',
    target: 2,
    titleKey: 'practice.u5.title',
    requirementKey: 'practice.u5.requirement',
    hintKey: 'practice.u5.hint',
    actionKey: 'practice.u5.action',
    actionHref: '#/market',
  },
  quiz: { id: 'u5', passScore: 80 },
};

const UNIT_6 = {
  id: 'u6',
  number: 6,
  stageId: 'stage2',
  implemented: true,
  titleKey: 'curriculum.u6.title',
  summaryKey: 'curriculum.u6.summary',
  minutes: 14,
  prerequisites: ['u5'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u6.s1.title',
      blocks: [
        p('lesson.u6.s1.p1'),
        p('lesson.u6.s1.p2'),
        term('growthStock'),
        demo('stockStyle'),
        example('lesson.u6.s1.example.title', ['lesson.u6.s1.example.l1', 'lesson.u6.s1.example.l2']),
        callout('warning', 'lesson.u6.s1.warn.title', 'lesson.u6.s1.warn.text'),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u6.s2.title',
      blocks: [
        p('lesson.u6.s2.p1'),
        p('lesson.u6.s2.p2'),
        term('valueStock'),
        term('cyclicalStock'),
        list('lesson.u6.s2.list.title', [
          'lesson.u6.s2.list.i1',
          'lesson.u6.s2.list.i2',
          'lesson.u6.s2.list.i3',
        ]),
        callout('pro', 'lesson.u6.s2.pro.title', 'lesson.u6.s2.pro.text'),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u6.s3.title',
      blocks: [
        p('lesson.u6.s3.p1'),
        p('lesson.u6.s3.p2'),
        example('lesson.u6.s3.example.title', ['lesson.u6.s3.example.l1', 'lesson.u6.s3.example.l2']),
        callout('myth', 'lesson.u6.s3.myth.title', 'lesson.u6.s3.myth.text'),
        callout('tip', 'lesson.u6.s3.tip.title', 'lesson.u6.s3.tip.text'),
      ],
    },
  ],
  practice: {
    id: 'u6-p1',
    check: 'inspect-styles',
    target: 3,
    titleKey: 'practice.u6.title',
    requirementKey: 'practice.u6.requirement',
    hintKey: 'practice.u6.hint',
    actionKey: 'practice.u6.action',
    actionHref: '#/market',
  },
  quiz: { id: 'u6', passScore: 80 },
};

const UNIT_7 = {
  id: 'u7',
  number: 7,
  stageId: 'stage2',
  implemented: true,
  titleKey: 'curriculum.u7.title',
  summaryKey: 'curriculum.u7.summary',
  minutes: 15,
  prerequisites: ['u6'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u7.s1.title',
      blocks: [
        p('lesson.u7.s1.p1'),
        p('lesson.u7.s1.p2'),
        term('etf'),
        list('lesson.u7.s1.list.title', [
          'lesson.u7.s1.list.i1',
          'lesson.u7.s1.list.i2',
          'lesson.u7.s1.list.i3',
        ]),
        callout('warning', 'lesson.u7.s1.warn.title', 'lesson.u7.s1.warn.text'),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u7.s2.title',
      blocks: [
        p('lesson.u7.s2.p1'),
        p('lesson.u7.s2.p2'),
        term('diversification'),
        demo('diversification'),
        example('lesson.u7.s2.example.title', ['lesson.u7.s2.example.l1', 'lesson.u7.s2.example.l2']),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u7.s3.title',
      blocks: [
        p('lesson.u7.s3.p1'),
        p('lesson.u7.s3.p2'),
        example('lesson.u7.s3.example.title', ['lesson.u7.s3.example.l1', 'lesson.u7.s3.example.l2']),
        callout('pro', 'lesson.u7.s3.pro.title', 'lesson.u7.s3.pro.text'),
        callout('tip', 'lesson.u7.s3.tip.title', 'lesson.u7.s3.tip.text'),
      ],
    },
  ],
  practice: {
    id: 'u7-p1',
    check: 'diversify-sectors',
    target: 3,
    titleKey: 'practice.u7.title',
    requirementKey: 'practice.u7.requirement',
    hintKey: 'practice.u7.hint',
    actionKey: 'practice.u7.action',
    actionHref: '#/market',
  },
  quiz: { id: 'u7', passScore: 80 },
};

const UNIT_8 = {
  id: 'u8',
  number: 8,
  stageId: 'stage2',
  implemented: true,
  titleKey: 'curriculum.u8.title',
  summaryKey: 'curriculum.u8.summary',
  minutes: 15,
  prerequisites: ['u7'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u8.s1.title',
      blocks: [
        p('lesson.u8.s1.p1'),
        p('lesson.u8.s1.p2'),
        term('compounding'),
        formula('lesson.u8.s1.f1', 'lesson.u8.s1.f1note'),
        example('lesson.u8.s1.example.title', ['lesson.u8.s1.example.l1', 'lesson.u8.s1.example.l2']),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u8.s2.title',
      blocks: [
        p('lesson.u8.s2.p1'),
        p('lesson.u8.s2.p2'),
        demo('compounding'),
        example('lesson.u8.s2.example.title', ['lesson.u8.s2.example.l1', 'lesson.u8.s2.example.l2']),
        callout('pro', 'lesson.u8.s2.pro.title', 'lesson.u8.s2.pro.text'),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u8.s3.title',
      blocks: [
        p('lesson.u8.s3.p1'),
        p('lesson.u8.s3.p2'),
        callout('warning', 'lesson.u8.s3.warn.title', 'lesson.u8.s3.warn.text'),
        callout('tip', 'lesson.u8.s3.tip.title', 'lesson.u8.s3.tip.text'),
      ],
    },
  ],
  practice: {
    id: 'u8-p1',
    check: 'hold-days',
    target: 15,
    titleKey: 'practice.u8.title',
    requirementKey: 'practice.u8.requirement',
    hintKey: 'practice.u8.hint',
    actionKey: 'practice.u8.action',
    actionHref: '#/portfolio',
  },
  quiz: { id: 'u8', passScore: 80 },
};

const UNIT_9 = {
  id: 'u9',
  number: 9,
  stageId: 'stage3',
  implemented: true,
  titleKey: 'curriculum.u9.title',
  summaryKey: 'curriculum.u9.summary',
  minutes: 14,
  prerequisites: ['u8'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u9.s1.title',
      blocks: [
        p('lesson.u9.s1.p1'),
        p('lesson.u9.s1.p2'),
        term('candle'),
        demo('candle'),
        example('lesson.u9.s1.example.title', ['lesson.u9.s1.example.l1', 'lesson.u9.s1.example.l2']),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u9.s2.title',
      blocks: [
        p('lesson.u9.s2.p1'),
        p('lesson.u9.s2.p2'),
        list('lesson.u9.s2.list.title', [
          'lesson.u9.s2.list.i1',
          'lesson.u9.s2.list.i2',
          'lesson.u9.s2.list.i3',
        ]),
        callout('warning', 'lesson.u9.s2.warn.title', 'lesson.u9.s2.warn.text'),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u9.s3.title',
      blocks: [
        p('lesson.u9.s3.p1'),
        p('lesson.u9.s3.p2'),
        example('lesson.u9.s3.example.title', ['lesson.u9.s3.example.l1', 'lesson.u9.s3.example.l2']),
        callout('tip', 'lesson.u9.s3.tip.title', 'lesson.u9.s3.tip.text'),
      ],
    },
  ],
  practice: {
    id: 'u9-p1',
    check: 'demo',
    demoId: 'candle',
    titleKey: 'practice.u9.title',
    requirementKey: 'practice.u9.requirement',
    hintKey: 'practice.u9.hint',
    actionKey: 'practice.u9.action',
    actionHref: '#/academy/u9/s1',
  },
  quiz: { id: 'u9', passScore: 80 },
};

const UNIT_10 = {
  id: 'u10',
  number: 10,
  stageId: 'stage3',
  implemented: true,
  titleKey: 'curriculum.u10.title',
  summaryKey: 'curriculum.u10.summary',
  minutes: 15,
  prerequisites: ['u9'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u10.s1.title',
      blocks: [
        p('lesson.u10.s1.p1'),
        p('lesson.u10.s1.p2'),
        term('sma'),
        demo('indicators'),
        example('lesson.u10.s1.example.title', ['lesson.u10.s1.example.l1', 'lesson.u10.s1.example.l2']),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u10.s2.title',
      blocks: [
        p('lesson.u10.s2.p1'),
        p('lesson.u10.s2.p2'),
        term('rsi'),
        list('lesson.u10.s2.list.title', [
          'lesson.u10.s2.list.i1',
          'lesson.u10.s2.list.i2',
          'lesson.u10.s2.list.i3',
        ]),
        callout('warning', 'lesson.u10.s2.warn.title', 'lesson.u10.s2.warn.text'),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u10.s3.title',
      blocks: [
        p('lesson.u10.s3.p1'),
        p('lesson.u10.s3.p2'),
        example('lesson.u10.s3.example.title', ['lesson.u10.s3.example.l1', 'lesson.u10.s3.example.l2']),
        callout('pro', 'lesson.u10.s3.pro.title', 'lesson.u10.s3.pro.text'),
      ],
    },
  ],
  practice: {
    id: 'u10-p1',
    check: 'demo',
    demoId: 'indicators',
    titleKey: 'practice.u10.title',
    requirementKey: 'practice.u10.requirement',
    hintKey: 'practice.u10.hint',
    actionKey: 'practice.u10.action',
    actionHref: '#/academy/u10/s1',
  },
  quiz: { id: 'u10', passScore: 80 },
};

const UNIT_11 = {
  id: 'u11',
  number: 11,
  stageId: 'stage3',
  implemented: true,
  titleKey: 'curriculum.u11.title',
  summaryKey: 'curriculum.u11.summary',
  minutes: 16,
  prerequisites: ['u10'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u11.s1.title',
      blocks: [
        p('lesson.u11.s1.p1'),
        p('lesson.u11.s1.p2'),
        term('incomeStatement'),
        demo('financials'),
        example('lesson.u11.s1.example.title', ['lesson.u11.s1.example.l1', 'lesson.u11.s1.example.l2']),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u11.s2.title',
      blocks: [
        p('lesson.u11.s2.p1'),
        p('lesson.u11.s2.p2'),
        term('balanceSheet'),
        formula('lesson.u11.s2.f1', 'lesson.u11.s2.f1note'),
        callout('warning', 'lesson.u11.s2.warn.title', 'lesson.u11.s2.warn.text'),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u11.s3.title',
      blocks: [
        p('lesson.u11.s3.p1'),
        p('lesson.u11.s3.p2'),
        term('freeCashFlow'),
        list('lesson.u11.s3.list.title', [
          'lesson.u11.s3.list.i1',
          'lesson.u11.s3.list.i2',
          'lesson.u11.s3.list.i3',
        ]),
        callout('tip', 'lesson.u11.s3.tip.title', 'lesson.u11.s3.tip.text'),
      ],
    },
  ],
  practice: {
    id: 'u11-p1',
    check: 'advanced-inspect',
    target: 2,
    titleKey: 'practice.u11.title',
    requirementKey: 'practice.u11.requirement',
    hintKey: 'practice.u11.hint',
    actionKey: 'practice.u11.action',
    actionHref: '#/settings',
  },
  quiz: { id: 'u11', passScore: 80 },
};

const UNIT_12 = {
  id: 'u12',
  number: 12,
  stageId: 'stage3',
  implemented: true,
  titleKey: 'curriculum.u12.title',
  summaryKey: 'curriculum.u12.summary',
  minutes: 16,
  prerequisites: ['u11'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u12.s1.title',
      blocks: [
        p('lesson.u12.s1.p1'),
        p('lesson.u12.s1.p2'),
        term('dcf'),
        formula('lesson.u12.s1.f1', 'lesson.u12.s1.f1note'),
        example('lesson.u12.s1.example.title', ['lesson.u12.s1.example.l1', 'lesson.u12.s1.example.l2']),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u12.s2.title',
      blocks: [
        p('lesson.u12.s2.p1'),
        p('lesson.u12.s2.p2'),
        demo('dcf'),
        callout('pro', 'lesson.u12.s2.pro.title', 'lesson.u12.s2.pro.text'),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u12.s3.title',
      blocks: [
        p('lesson.u12.s3.p1'),
        p('lesson.u12.s3.p2'),
        callout('warning', 'lesson.u12.s3.warn.title', 'lesson.u12.s3.warn.text'),
        callout('tip', 'lesson.u12.s3.tip.title', 'lesson.u12.s3.tip.text'),
      ],
    },
  ],
  practice: {
    id: 'u12-p1',
    check: 'demo',
    demoId: 'dcf',
    titleKey: 'practice.u12.title',
    requirementKey: 'practice.u12.requirement',
    hintKey: 'practice.u12.hint',
    actionKey: 'practice.u12.action',
    actionHref: '#/academy/u12/s2',
  },
  quiz: { id: 'u12', passScore: 80 },
};

const UNIT_13 = {
  id: 'u13',
  number: 13,
  stageId: 'stage4',
  implemented: true,
  titleKey: 'curriculum.u13.title',
  summaryKey: 'curriculum.u13.summary',
  minutes: 15,
  prerequisites: ['u12'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u13.s1.title',
      blocks: [
        p('lesson.u13.s1.p1'),
        p('lesson.u13.s1.p2'),
        term('gdp'),
        demo('macro'),
        example('lesson.u13.s1.example.title', ['lesson.u13.s1.example.l1', 'lesson.u13.s1.example.l2']),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u13.s2.title',
      blocks: [
        p('lesson.u13.s2.p1'),
        p('lesson.u13.s2.p2'),
        term('inflation'),
        list('lesson.u13.s2.list.title', [
          'lesson.u13.s2.list.i1',
          'lesson.u13.s2.list.i2',
          'lesson.u13.s2.list.i3',
        ]),
        callout('warning', 'lesson.u13.s2.warn.title', 'lesson.u13.s2.warn.text'),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u13.s3.title',
      blocks: [
        p('lesson.u13.s3.p1'),
        p('lesson.u13.s3.p2'),
        term('interestRate'),
        example('lesson.u13.s3.example.title', ['lesson.u13.s3.example.l1', 'lesson.u13.s3.example.l2']),
        callout('pro', 'lesson.u13.s3.pro.title', 'lesson.u13.s3.pro.text'),
      ],
    },
  ],
  practice: {
    id: 'u13-p1',
    check: 'demo',
    demoId: 'macro',
    titleKey: 'practice.u13.title',
    requirementKey: 'practice.u13.requirement',
    hintKey: 'practice.u13.hint',
    actionKey: 'practice.u13.action',
    actionHref: '#/academy/u13/s1',
  },
  quiz: { id: 'u13', passScore: 80 },
};

const UNIT_14 = {
  id: 'u14',
  number: 14,
  stageId: 'stage4',
  implemented: true,
  titleKey: 'curriculum.u14.title',
  summaryKey: 'curriculum.u14.summary',
  minutes: 15,
  prerequisites: ['u13'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u14.s1.title',
      blocks: [
        p('lesson.u14.s1.p1'),
        p('lesson.u14.s1.p2'),
        term('assetAllocation'),
        demo('allocation'),
        example('lesson.u14.s1.example.title', ['lesson.u14.s1.example.l1', 'lesson.u14.s1.example.l2']),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u14.s2.title',
      blocks: [
        p('lesson.u14.s2.p1'),
        p('lesson.u14.s2.p2'),
        list('lesson.u14.s2.list.title', [
          'lesson.u14.s2.list.i1',
          'lesson.u14.s2.list.i2',
          'lesson.u14.s2.list.i3',
        ]),
        callout('warning', 'lesson.u14.s2.warn.title', 'lesson.u14.s2.warn.text'),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u14.s3.title',
      blocks: [
        p('lesson.u14.s3.p1'),
        p('lesson.u14.s3.p2'),
        example('lesson.u14.s3.example.title', ['lesson.u14.s3.example.l1', 'lesson.u14.s3.example.l2']),
        callout('tip', 'lesson.u14.s3.tip.title', 'lesson.u14.s3.tip.text'),
      ],
    },
  ],
  practice: {
    id: 'u14-p1',
    check: 'demo',
    demoId: 'allocation',
    titleKey: 'practice.u14.title',
    requirementKey: 'practice.u14.requirement',
    hintKey: 'practice.u14.hint',
    actionKey: 'practice.u14.action',
    actionHref: '#/academy/u14/s1',
  },
  quiz: { id: 'u14', passScore: 80 },
};

const UNIT_15 = {
  id: 'u15',
  number: 15,
  stageId: 'stage4',
  implemented: true,
  titleKey: 'curriculum.u15.title',
  summaryKey: 'curriculum.u15.summary',
  minutes: 16,
  prerequisites: ['u14'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u15.s1.title',
      blocks: [
        p('lesson.u15.s1.p1'),
        p('lesson.u15.s1.p2'),
        term('positionSizing'),
        demo('risk'),
        example('lesson.u15.s1.example.title', ['lesson.u15.s1.example.l1', 'lesson.u15.s1.example.l2']),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u15.s2.title',
      blocks: [
        p('lesson.u15.s2.p1'),
        p('lesson.u15.s2.p2'),
        term('drawdown'),
        list('lesson.u15.s2.list.title', [
          'lesson.u15.s2.list.i1',
          'lesson.u15.s2.list.i2',
          'lesson.u15.s2.list.i3',
        ]),
        callout('warning', 'lesson.u15.s2.warn.title', 'lesson.u15.s2.warn.text'),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u15.s3.title',
      blocks: [
        p('lesson.u15.s3.p1'),
        p('lesson.u15.s3.p2'),
        example('lesson.u15.s3.example.title', ['lesson.u15.s3.example.l1', 'lesson.u15.s3.example.l2']),
        callout('pro', 'lesson.u15.s3.pro.title', 'lesson.u15.s3.pro.text'),
      ],
    },
  ],
  practice: {
    id: 'u15-p1',
    check: 'demo',
    demoId: 'risk',
    titleKey: 'practice.u15.title',
    requirementKey: 'practice.u15.requirement',
    hintKey: 'practice.u15.hint',
    actionKey: 'practice.u15.action',
    actionHref: '#/academy/u15/s1',
  },
  quiz: { id: 'u15', passScore: 80 },
};

const UNIT_16 = {
  id: 'u16',
  number: 16,
  stageId: 'stage4',
  implemented: true,
  titleKey: 'curriculum.u16.title',
  summaryKey: 'curriculum.u16.summary',
  minutes: 16,
  prerequisites: ['u15'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u16.s1.title',
      blocks: [
        p('lesson.u16.s1.p1'),
        p('lesson.u16.s1.p2'),
        term('momentum'),
        demo('strategies'),
        example('lesson.u16.s1.example.title', ['lesson.u16.s1.example.l1', 'lesson.u16.s1.example.l2']),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u16.s2.title',
      blocks: [
        p('lesson.u16.s2.p1'),
        p('lesson.u16.s2.p2'),
        list('lesson.u16.s2.list.title', [
          'lesson.u16.s2.list.i1',
          'lesson.u16.s2.list.i2',
          'lesson.u16.s2.list.i3',
        ]),
        callout('warning', 'lesson.u16.s2.warn.title', 'lesson.u16.s2.warn.text'),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u16.s3.title',
      blocks: [
        p('lesson.u16.s3.p1'),
        p('lesson.u16.s3.p2'),
        example('lesson.u16.s3.example.title', ['lesson.u16.s3.example.l1', 'lesson.u16.s3.example.l2']),
        callout('tip', 'lesson.u16.s3.tip.title', 'lesson.u16.s3.tip.text'),
      ],
    },
  ],
  practice: {
    id: 'u16-p1',
    check: 'demo',
    demoId: 'strategies',
    titleKey: 'practice.u16.title',
    requirementKey: 'practice.u16.requirement',
    hintKey: 'practice.u16.hint',
    actionKey: 'practice.u16.action',
    actionHref: '#/academy/u16/s1',
  },
  quiz: { id: 'u16', passScore: 80 },
};

export const STAGE_1_UNITS = [UNIT_1, UNIT_2, UNIT_3, UNIT_4];

const UNIT_17 = {
  id: 'u17',
  number: 17,
  stageId: 'stage5',
  implemented: true,
  titleKey: 'curriculum.u17.title',
  summaryKey: 'curriculum.u17.summary',
  minutes: 16,
  prerequisites: ['u16'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u17.s1.title',
      blocks: [
        p('lesson.u17.s1.p1'),
        p('lesson.u17.s1.p2'),
        term('shortSelling'),
        example('lesson.u17.s1.example.title', ['lesson.u17.s1.example.l1', 'lesson.u17.s1.example.l2']),
        callout('warning', 'lesson.u17.s1.warn.title', 'lesson.u17.s1.warn.text'),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u17.s2.title',
      blocks: [
        p('lesson.u17.s2.p1'),
        p('lesson.u17.s2.p2'),
        list('lesson.u17.s2.list.title', [
          'lesson.u17.s2.list.i1',
          'lesson.u17.s2.list.i2',
          'lesson.u17.s2.list.i3',
        ]),
        demo('shortPnl'),
        callout('info', 'lesson.u17.s2.info.title', 'lesson.u17.s2.info.text'),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u17.s3.title',
      blocks: [
        p('lesson.u17.s3.p1'),
        p('lesson.u17.s3.p2'),
        example('lesson.u17.s3.example.title', ['lesson.u17.s3.example.l1', 'lesson.u17.s3.example.l2']),
        callout('pro', 'lesson.u17.s3.pro.title', 'lesson.u17.s3.pro.text'),
      ],
    },
  ],
  practice: {
    id: 'u17-p1',
    check: 'short-round-trip',
    titleKey: 'practice.u17.title',
    requirementKey: 'practice.u17.requirement',
    hintKey: 'practice.u17.hint',
    actionKey: 'practice.u17.action',
    actionHref: '#/market',
  },
  quiz: { id: 'u17', passScore: 80 },
};

const UNIT_18 = {
  id: 'u18',
  number: 18,
  stageId: 'stage5',
  implemented: true,
  titleKey: 'curriculum.u18.title',
  summaryKey: 'curriculum.u18.summary',
  minutes: 16,
  prerequisites: ['u17'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u18.s1.title',
      blocks: [
        p('lesson.u18.s1.p1'),
        p('lesson.u18.s1.p2'),
        term('margin'),
        example('lesson.u18.s1.example.title', ['lesson.u18.s1.example.l1', 'lesson.u18.s1.example.l2']),
        demo('margin'),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u18.s2.title',
      blocks: [
        p('lesson.u18.s2.p1'),
        p('lesson.u18.s2.p2'),
        formula('lesson.u18.s2.formula', 'lesson.u18.s2.note'),
        list('lesson.u18.s2.list.title', [
          'lesson.u18.s2.list.i1',
          'lesson.u18.s2.list.i2',
          'lesson.u18.s2.list.i3',
        ]),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u18.s3.title',
      blocks: [
        p('lesson.u18.s3.p1'),
        p('lesson.u18.s3.p2'),
        term('marginCall'),
        example('lesson.u18.s3.example.title', ['lesson.u18.s3.example.l1', 'lesson.u18.s3.example.l2']),
        callout('danger', 'lesson.u18.s3.warn.title', 'lesson.u18.s3.warn.text'),
      ],
    },
  ],
  practice: {
    id: 'u18-p1',
    check: 'demo',
    demoId: 'margin',
    titleKey: 'practice.u18.title',
    requirementKey: 'practice.u18.requirement',
    hintKey: 'practice.u18.hint',
    actionKey: 'practice.u18.action',
    actionHref: '#/academy/u18/s1',
  },
  quiz: { id: 'u18', passScore: 80 },
};

const UNIT_19 = {
  id: 'u19',
  number: 19,
  stageId: 'stage5',
  implemented: true,
  titleKey: 'curriculum.u19.title',
  summaryKey: 'curriculum.u19.summary',
  minutes: 15,
  prerequisites: ['u18'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u19.s1.title',
      blocks: [
        p('lesson.u19.s1.p1'),
        p('lesson.u19.s1.p2'),
        term('stopOrder'),
        example('lesson.u19.s1.example.title', ['lesson.u19.s1.example.l1', 'lesson.u19.s1.example.l2']),
        demo('stopOrder'),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u19.s2.title',
      blocks: [
        p('lesson.u19.s2.p1'),
        p('lesson.u19.s2.p2'),
        term('trailingStop'),
        example('lesson.u19.s2.example.title', ['lesson.u19.s2.example.l1', 'lesson.u19.s2.example.l2']),
        list('lesson.u19.s2.list.title', [
          'lesson.u19.s2.list.i1',
          'lesson.u19.s2.list.i2',
          'lesson.u19.s2.list.i3',
        ]),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u19.s3.title',
      blocks: [
        p('lesson.u19.s3.p1'),
        p('lesson.u19.s3.p2'),
        callout('warning', 'lesson.u19.s3.warn.title', 'lesson.u19.s3.warn.text'),
        example('lesson.u19.s3.example.title', ['lesson.u19.s3.example.l1', 'lesson.u19.s3.example.l2']),
        callout('pro', 'lesson.u19.s3.pro.title', 'lesson.u19.s3.pro.text'),
      ],
    },
  ],
  practice: {
    id: 'u19-p1',
    check: 'stop-fill',
    titleKey: 'practice.u19.title',
    requirementKey: 'practice.u19.requirement',
    hintKey: 'practice.u19.hint',
    actionKey: 'practice.u19.action',
    actionHref: '#/market',
  },
  quiz: { id: 'u19', passScore: 80 },
};

const UNIT_20 = {
  id: 'u20',
  number: 20,
  stageId: 'stage5',
  implemented: true,
  titleKey: 'curriculum.u20.title',
  summaryKey: 'curriculum.u20.summary',
  minutes: 15,
  prerequisites: ['u19'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u20.s1.title',
      blocks: [
        p('lesson.u20.s1.p1'),
        p('lesson.u20.s1.p2'),
        term('orderBook'),
        example('lesson.u20.s1.example.title', ['lesson.u20.s1.example.l1', 'lesson.u20.s1.example.l2']),
        demo('orderBook'),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u20.s2.title',
      blocks: [
        p('lesson.u20.s2.p1'),
        p('lesson.u20.s2.p2'),
        term('liquidity'),
        list('lesson.u20.s2.list.title', [
          'lesson.u20.s2.list.i1',
          'lesson.u20.s2.list.i2',
          'lesson.u20.s2.list.i3',
        ]),
        callout('warning', 'lesson.u20.s2.warn.title', 'lesson.u20.s2.warn.text'),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u20.s3.title',
      blocks: [
        p('lesson.u20.s3.p1'),
        p('lesson.u20.s3.p2'),
        example('lesson.u20.s3.example.title', ['lesson.u20.s3.example.l1', 'lesson.u20.s3.example.l2']),
        callout('pro', 'lesson.u20.s3.pro.title', 'lesson.u20.s3.pro.text'),
      ],
    },
  ],
  practice: {
    id: 'u20-p1',
    check: 'demo',
    demoId: 'orderBook',
    titleKey: 'practice.u20.title',
    requirementKey: 'practice.u20.requirement',
    hintKey: 'practice.u20.hint',
    actionKey: 'practice.u20.action',
    actionHref: '#/academy/u20/s1',
  },
  quiz: { id: 'u20', passScore: 80 },
};

const UNIT_21 = {
  id: 'u21',
  number: 21,
  stageId: 'stage6',
  implemented: true,
  titleKey: 'curriculum.u21.title',
  summaryKey: 'curriculum.u21.summary',
  minutes: 16,
  prerequisites: ['u20'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u21.s1.title',
      blocks: [
        p('lesson.u21.s1.p1'),
        p('lesson.u21.s1.p2'),
        term('optionContract'),
        list('lesson.u21.s1.list.title', [
          'lesson.u21.s1.list.i1',
          'lesson.u21.s1.list.i2',
          'lesson.u21.s1.list.i3',
          'lesson.u21.s1.list.i4',
        ]),
        example('lesson.u21.s1.example.title', ['lesson.u21.s1.example.l1', 'lesson.u21.s1.example.l2']),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u21.s2.title',
      blocks: [
        p('lesson.u21.s2.p1'),
        p('lesson.u21.s2.p2'),
        term('callOption'),
        term('putOption'),
        demo('optionPayoff'),
        callout('info', 'lesson.u21.s2.info.title', 'lesson.u21.s2.info.text'),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u21.s3.title',
      blocks: [
        p('lesson.u21.s3.p1'),
        p('lesson.u21.s3.p2'),
        term('strikePrice'),
        term('optionPremium'),
        example('lesson.u21.s3.example.title', ['lesson.u21.s3.example.l1', 'lesson.u21.s3.example.l2']),
        callout('warning', 'lesson.u21.s3.warn.title', 'lesson.u21.s3.warn.text'),
      ],
    },
  ],
  practice: {
    id: 'u21-p1',
    check: 'option-buy',
    titleKey: 'practice.u21.title',
    requirementKey: 'practice.u21.requirement',
    hintKey: 'practice.u21.hint',
    actionKey: 'practice.u21.action',
    actionHref: '#/options',
  },
  quiz: { id: 'u21', passScore: 80 },
};

const UNIT_22 = {
  id: 'u22',
  number: 22,
  stageId: 'stage6',
  implemented: true,
  titleKey: 'curriculum.u22.title',
  summaryKey: 'curriculum.u22.summary',
  minutes: 15,
  prerequisites: ['u21'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u22.s1.title',
      blocks: [
        p('lesson.u22.s1.p1'),
        p('lesson.u22.s1.p2'),
        demo('optionPayoff'),
        example('lesson.u22.s1.example.title', ['lesson.u22.s1.example.l1', 'lesson.u22.s1.example.l2']),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u22.s2.title',
      blocks: [
        p('lesson.u22.s2.p1'),
        p('lesson.u22.s2.p2'),
        formula('lesson.u22.s2.formula', 'lesson.u22.s2.note'),
        example('lesson.u22.s2.example.title', ['lesson.u22.s2.example.l1', 'lesson.u22.s2.example.l2']),
        list('lesson.u22.s2.list.title', [
          'lesson.u22.s2.list.i1',
          'lesson.u22.s2.list.i2',
          'lesson.u22.s2.list.i3',
        ]),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u22.s3.title',
      blocks: [
        p('lesson.u22.s3.p1'),
        p('lesson.u22.s3.p2'),
        callout('warning', 'lesson.u22.s3.warn.title', 'lesson.u22.s3.warn.text'),
        callout('pro', 'lesson.u22.s3.pro.title', 'lesson.u22.s3.pro.text'),
      ],
    },
  ],
  practice: {
    id: 'u22-p1',
    check: 'option-buy-type',
    optionType: 'call',
    titleKey: 'practice.u22.title',
    requirementKey: 'practice.u22.requirement',
    hintKey: 'practice.u22.hint',
    actionKey: 'practice.u22.action',
    actionHref: '#/options',
  },
  quiz: { id: 'u22', passScore: 80 },
};

const UNIT_23 = {
  id: 'u23',
  number: 23,
  stageId: 'stage6',
  implemented: true,
  titleKey: 'curriculum.u23.title',
  summaryKey: 'curriculum.u23.summary',
  minutes: 15,
  prerequisites: ['u22'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u23.s1.title',
      blocks: [
        p('lesson.u23.s1.p1'),
        p('lesson.u23.s1.p2'),
        demo('optionPayoff'),
        example('lesson.u23.s1.example.title', ['lesson.u23.s1.example.l1', 'lesson.u23.s1.example.l2']),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u23.s2.title',
      blocks: [
        p('lesson.u23.s2.p1'),
        p('lesson.u23.s2.p2'),
        formula('lesson.u23.s2.formula', 'lesson.u23.s2.note'),
        example('lesson.u23.s2.example.title', ['lesson.u23.s2.example.l1', 'lesson.u23.s2.example.l2']),
        list('lesson.u23.s2.list.title', [
          'lesson.u23.s2.list.i1',
          'lesson.u23.s2.list.i2',
          'lesson.u23.s2.list.i3',
        ]),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u23.s3.title',
      blocks: [
        p('lesson.u23.s3.p1'),
        p('lesson.u23.s3.p2'),
        example('lesson.u23.s3.example.title', ['lesson.u23.s3.example.l1', 'lesson.u23.s3.example.l2']),
        callout('pro', 'lesson.u23.s3.pro.title', 'lesson.u23.s3.pro.text'),
      ],
    },
  ],
  practice: {
    id: 'u23-p1',
    check: 'option-buy-type',
    optionType: 'put',
    titleKey: 'practice.u23.title',
    requirementKey: 'practice.u23.requirement',
    hintKey: 'practice.u23.hint',
    actionKey: 'practice.u23.action',
    actionHref: '#/options',
  },
  quiz: { id: 'u23', passScore: 80 },
};

const UNIT_24 = {
  id: 'u24',
  number: 24,
  stageId: 'stage6',
  implemented: true,
  titleKey: 'curriculum.u24.title',
  summaryKey: 'curriculum.u24.summary',
  minutes: 17,
  prerequisites: ['u23'],
  unlocks: [],
  sections: [
    {
      id: 's1',
      titleKey: 'lesson.u24.s1.title',
      blocks: [
        p('lesson.u24.s1.p1'),
        p('lesson.u24.s1.p2'),
        term('impliedVolatility'),
        demo('greeks'),
        example('lesson.u24.s1.example.title', ['lesson.u24.s1.example.l1', 'lesson.u24.s1.example.l2']),
      ],
    },
    {
      id: 's2',
      titleKey: 'lesson.u24.s2.title',
      blocks: [
        p('lesson.u24.s2.p1'),
        p('lesson.u24.s2.p2'),
        formula('lesson.u24.s2.formula', 'lesson.u24.s2.note'),
        list('lesson.u24.s2.list.title', [
          'lesson.u24.s2.list.i1',
          'lesson.u24.s2.list.i2',
          'lesson.u24.s2.list.i3',
          'lesson.u24.s2.list.i4',
          'lesson.u24.s2.list.i5',
        ]),
      ],
    },
    {
      id: 's3',
      titleKey: 'lesson.u24.s3.title',
      blocks: [
        p('lesson.u24.s3.p1'),
        p('lesson.u24.s3.p2'),
        term('greeks'),
        list('lesson.u24.s3.list.title', [
          'lesson.u24.s3.list.i1',
          'lesson.u24.s3.list.i2',
          'lesson.u24.s3.list.i3',
          'lesson.u24.s3.list.i4',
          'lesson.u24.s3.list.i5',
        ]),
        callout('pro', 'lesson.u24.s3.pro.title', 'lesson.u24.s3.pro.text'),
      ],
    },
  ],
  practice: {
    id: 'u24-p1',
    check: 'demo',
    demoId: 'greeks',
    titleKey: 'practice.u24.title',
    requirementKey: 'practice.u24.requirement',
    hintKey: 'practice.u24.hint',
    actionKey: 'practice.u24.action',
    actionHref: '#/academy/u24/s1',
  },
  quiz: { id: 'u24', passScore: 80 },
};

const plannedUnit = (number, titleKey, summaryKey) => ({
  id: `u${number}`,
  number,
  stageId: null,
  implemented: false,
  titleKey,
  summaryKey,
});

export const STAGE_2_UNITS = [UNIT_5, UNIT_6, UNIT_7, UNIT_8];
export const STAGE_3_UNITS = [UNIT_9, UNIT_10, UNIT_11, UNIT_12];
export const STAGE_4_UNITS = [UNIT_13, UNIT_14, UNIT_15, UNIT_16];
export const STAGE_5_UNITS = [UNIT_17, UNIT_18, UNIT_19, UNIT_20];
export const STAGE_6_UNITS = [UNIT_21, UNIT_22, UNIT_23, UNIT_24];

export const STAGES = [
  {
    id: 'stage1',
    number: 1,
    implemented: true,
    titleKey: 'stage.stage1.title',
    summaryKey: 'stage.stage1.summary',
    units: STAGE_1_UNITS,
  },
  {
    id: 'stage2',
    number: 2,
    phase: 2,
    implemented: true,
    titleKey: 'stage.stage2.title',
    summaryKey: 'stage.stage2.summary',
    units: STAGE_2_UNITS,
  },
  {
    id: 'stage3',
    number: 3,
    phase: 2,
    implemented: true,
    titleKey: 'stage.stage3.title',
    summaryKey: 'stage.stage3.summary',
    units: STAGE_3_UNITS,
  },
  {
    id: 'stage4',
    number: 4,
    phase: 2,
    implemented: true,
    titleKey: 'stage.stage4.title',
    summaryKey: 'stage.stage4.summary',
    units: STAGE_4_UNITS,
  },
  {
    id: 'stage5',
    number: 5,
    phase: 3,
    implemented: true,
    titleKey: 'stage.stage5.title',
    summaryKey: 'stage.stage5.summary',
    units: STAGE_5_UNITS,
  },
  {
    id: 'stage6',
    number: 6,
    phase: 4,
    implemented: true,
    titleKey: 'stage.stage6.title',
    summaryKey: 'stage.stage6.summary',
    units: STAGE_6_UNITS,
  },
  {
    id: 'stage7',
    number: 7,
    phase: 4,
    implemented: false,
    titleKey: 'stage.stage7.title',
    summaryKey: 'stage.stage7.summary',
    units: [
      plannedUnit(25, 'curriculum.u25.title', 'curriculum.u25.summary'),
      plannedUnit(26, 'curriculum.u26.title', 'curriculum.u26.summary'),
      plannedUnit(27, 'curriculum.u27.title', 'curriculum.u27.summary'),
      plannedUnit(28, 'curriculum.u28.title', 'curriculum.u28.summary'),
    ],
  },
  {
    id: 'stage8',
    number: 8,
    phase: 5,
    implemented: false,
    titleKey: 'stage.stage8.title',
    summaryKey: 'stage.stage8.summary',
    units: [
      plannedUnit(29, 'curriculum.u29.title', 'curriculum.u29.summary'),
      plannedUnit(30, 'curriculum.u30.title', 'curriculum.u30.summary'),
      plannedUnit(31, 'curriculum.u31.title', 'curriculum.u31.summary'),
      plannedUnit(32, 'curriculum.u32.title', 'curriculum.u32.summary'),
    ],
  },
];

export const ALL_UNITS = STAGES.flatMap((stage) => stage.units);

export function getUnit(unitId) {
  return ALL_UNITS.find((unit) => unit.id === unitId) || null;
}

export function getSection(unitId, sectionId) {
  const unit = getUnit(unitId);
  if (!unit) return null;
  return unit.sections.find((section) => section.id === sectionId) || null;
}

export function stageOf(unitId) {
  return STAGES.find((stage) => stage.units.some((unit) => unit.id === unitId)) || null;
}

export function sectionKey(unitId, sectionId) {
  return `${unitId}.${sectionId}`;
}

export function nextUnitId(unitId) {
  const implemented = ALL_UNITS.filter((unit) => unit.implemented);
  const index = implemented.findIndex((unit) => unit.id === unitId);
  if (index < 0 || index >= implemented.length - 1) return null;
  return implemented[index + 1].id;
}
