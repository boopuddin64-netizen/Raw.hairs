import { count, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  categories,
  products,
  productVariants,
  services,
  storeSettings,
  users,
  type InterstateZoneRule,
  type RiversZoneRule,
  type StaffPermissionMatrix,
} from './schema.ts';

let seedPromise: Promise<void> | null = null;

export const DEFAULT_RIVERS_ZONES: RiversZoneRule[] = [
  {
    id: 'ph-gra',
    name: 'Port Harcourt Metro (New GRA, Old GRA, D-Line)',
    feeNgn: 2500,
    etaText: 'Same Day · 2–4 hrs',
    podEligible: true,
  },
  {
    id: 'ph-obio',
    name: 'Obio-Akpor (Rumuola, Ada George, Rumuokoro, Woji)',
    feeNgn: 3000,
    etaText: 'Same Day · 3–5 hrs',
    podEligible: true,
  },
  {
    id: 'ph-eleme',
    name: 'Eleme, Oyigbo & Onne Corridor',
    feeNgn: 4500,
    etaText: 'Next Day · 24 hrs',
    podEligible: false,
  },
  {
    id: 'rivers-outer',
    name: 'Outer Rivers LGAs (Bonny, Ahoada, Bori, Omoku)',
    feeNgn: 6000,
    etaText: '1–2 Business Days',
    podEligible: false,
  },
];

export const DEFAULT_INTERSTATE_ZONES: InterstateZoneRule[] = [
  {
    id: 'south-south-east',
    name: 'South-South & South-East (Bayelsa, Akwa Ibom, Delta, Abia, Imo, Enugu)',
    states: ['Bayelsa', 'Akwa Ibom', 'Delta', 'Abia', 'Imo', 'Enugu', 'Anambra', 'Cross River', 'Edo'],
    feeNgn: 5000,
    etaText: '1–2 Business Days',
  },
  {
    id: 'lagos-abuja',
    name: 'Abuja (FCT) & Lagos Express',
    states: ['Lagos', 'FCT Abuja', 'Ogun', 'Oyo'],
    feeNgn: 6500,
    etaText: '2–3 Business Days',
  },
  {
    id: 'northern-states',
    name: 'Northern & Other Nigerian States',
    states: ['Kano', 'Kaduna', 'Plateau', 'Kwara', 'Other'],
    feeNgn: 8500,
    etaText: '3–4 Business Days',
  },
];

export const DEFAULT_STAFF_PERMISSIONS: StaffPermissionMatrix = {
  manageProducts: true,
  manageOrders: true,
  manageBookings: true,
  manageReturns: true,
  manageQuotations: true,
  manageDispatch: true,
  viewFinancials: false,
};

async function runSeed() {
  const [{ value: settingsCount }] = await db.select({ value: count() }).from(storeSettings);
  if (settingsCount === 0) {
    await db
      .insert(storeSettings)
      .values({
        key: 'commerce',
        riversZones: DEFAULT_RIVERS_ZONES,
        interstateZones: DEFAULT_INTERSTATE_ZONES,
        podEnabled: false,
        podAllowedZones: [],
        podMaxOrderNgn: 250000,
        bankTransferEnabled: true,
        bankName: 'Providus Bank',
        bankAccountNumber: '5401928374',
        bankAccountName: 'Raw.hairs Studio Port Harcourt',
        bankTransferInstructions:
          'Transfer the exact total using your RH order number as narration, then enter your transaction/session code and upload your receipt for Admin confirmation.',
        deliveryProofMode: 'otp_photo',
        returnWindowHours: 48,
        returnEligibilityNotes:
          'Returns are accepted within 48 hours of confirmed delivery for unworn, unwashed hair and unused sealed tools/care items with original Raw.hairs packaging intact. Photographic evidence is required.',
        whatsappProvider: 'meta_cloud',
        whatsappEnabled: true,
        staffPermissions: DEFAULT_STAFF_PERMISSIONS,
      })
      .onConflictDoNothing();
  }

  const [{ value: userCount }] = await db.select({ value: count() }).from(users);
  if (userCount === 0) {
    await db
      .insert(users)
      .values([
        {
          uid: 'seed-owner-admin',
          email: 'boopuddin64@gmail.com',
          fullName: 'Raw.hairs Founder',
          phone: '+2348000000001',
          role: 'owneradmin',
          defaultState: 'Rivers',
          defaultZone: 'ph-gra',
          defaultAddress: 'New GRA, Port Harcourt, Rivers State',
        },
        {
          uid: 'rider-ph-01',
          email: 'rider.ph@rawhairs.ng',
          fullName: 'Chidi Okafor (PH Dispatch)',
          phone: '+2348091112233',
          role: 'dispatch',
          defaultState: 'Rivers',
          defaultZone: 'ph-gra',
          defaultAddress: 'Port Harcourt Dispatch Hub, Rivers State',
          isActive: false,
        },
        {
          uid: 'rider-ph-02',
          email: 'rider.obio@rawhairs.ng',
          fullName: 'Amaka Nwosu (Obio-Akpor Rider)',
          phone: '+2348094445566',
          role: 'dispatch',
          defaultState: 'Rivers',
          defaultZone: 'ph-obio',
          defaultAddress: 'Rumuola Hub, Obio-Akpor, Rivers State',
        },
      ])
      .onConflictDoNothing();
  }

  const categorySeed = [
    { slug: 'bone-straight', name: 'Bone Straight', description: 'Glass-luster single-donor straight bundles & units.', sortOrder: 1 },
    { slug: 'body-wave', name: 'Body Wave', description: 'Soft effortless S-wave movement with full density.', sortOrder: 2 },
    { slug: 'loose-wave', name: 'Loose Wave', description: 'Airy undone waves with natural root volume.', sortOrder: 3 },
    { slug: 'deep-wave', name: 'Deep Wave', description: 'Sculpted deep ripples that hold sheen wet or dry.', sortOrder: 4 },
    { slug: 'water-wave', name: 'Water Wave', description: 'Fluid coastal waves ideal for tropical humidity.', sortOrder: 5 },
    { slug: 'curly', name: 'Curly', description: 'Defined bouncy single-donor curls with zero tangling.', sortOrder: 6 },
    { slug: 'colored', name: 'Colored', description: 'Salon-toned honey blonde, chestnut & piano blends.', sortOrder: 7 },
    { slug: 'lace', name: 'Lace', description: 'Ultra-thin Swiss HD closures & 13x4 / 13x6 frontals.', sortOrder: 8 },
    { slug: 'ready-units', name: 'Ready units', description: 'Pre-plucked, bleached & custom styled glueless wigs.', sortOrder: 9 },
    { slug: 'hair-care', name: 'Hair Care', description: 'Silk serums, lace melt mists, edge control & detox care.', sortOrder: 10 },
    { slug: 'styling-tools', name: 'Styling Tools', description: 'Titanium straighteners, ceramic curlers, clippers & shears.', sortOrder: 11 },
  ];

  for (const cat of categorySeed) {
    await db
      .insert(categories)
      .values(cat)
      .onConflictDoUpdate({
        target: categories.slug,
        set: { name: cat.name, description: cat.description, sortOrder: cat.sortOrder },
      });
  }

  const seedCatalog = [
    {
      slug: 'atelier-bone-straight-bundles',
      name: 'Atelier Bone Straight Bundles',
      categorySlug: 'bone-straight',
      texture: 'Bone Straight',
      origin: 'Single-Donor Vietnamese Raw',
      description:
        'Silky, double-drawn single-donor bone straight hair with aligned cuticles, bone-flat luster, and minimal shedding.',
      imageUrl: '/catalogue/bone.jpg',
      gallery: ['/catalogue/bone.jpg', '/catalogue/hero.jpg'],
      basePriceNgn: 135000,
      basePriceUsd: 92,
      featured: true,
      variants: [
        { sku: 'RH-BS-16-BDL', lengthInches: 16, laceType: '3-Bundle Deal', colorShade: 'Natural Black', priceNgn: 135000, priceUsd: 92, totalStock: 9 },
        { sku: 'RH-BS-20-BDL', lengthInches: 20, laceType: '3-Bundle Deal', colorShade: 'Natural Black', priceNgn: 168000, priceUsd: 112, totalStock: 7 },
        { sku: 'RH-BS-24-BDL', lengthInches: 24, laceType: '3-Bundle Deal', colorShade: 'Natural Black', priceNgn: 210000, priceUsd: 138, totalStock: 4 },
      ],
    },
    {
      slug: 'velvet-body-wave-collection',
      name: 'Velvet Body Wave Collection',
      categorySlug: 'body-wave',
      texture: 'Body Wave',
      origin: 'Raw Burmese Virgin',
      description:
        'Voluminous natural S-wave bundles crafted for effortless movement, high-heat styling resilience, and mirror shine.',
      imageUrl: '/catalogue/body.jpg',
      gallery: ['/catalogue/body.jpg', '/catalogue/hero.jpg'],
      basePriceNgn: 128000,
      basePriceUsd: 86,
      featured: true,
      variants: [
        { sku: 'RH-BW-18-5X5', lengthInches: 18, laceType: '5x5 HD Closure + 3 Bundles', colorShade: 'Natural 1B', priceNgn: 165000, priceUsd: 110, totalStock: 6 },
        { sku: 'RH-BW-22-5X5', lengthInches: 22, laceType: '5x5 HD Closure + 3 Bundles', colorShade: 'Natural 1B', priceNgn: 198000, priceUsd: 132, totalStock: 5 },
        { sku: 'RH-BW-26-13X4', lengthInches: 26, laceType: '13x4 HD Frontal + 3 Bundles', colorShade: 'Natural 1B', priceNgn: 245000, priceUsd: 164, totalStock: 3 },
      ],
    },
    {
      slug: 'sovereign-deep-curly-unit',
      name: 'Sovereign Deep Curly HD Unit',
      categorySlug: 'curly',
      texture: 'Curly',
      origin: 'Raw Cambodian Curly',
      description:
        'Defined spring curls on an ultra-thin pre-plucked HD lace frontal cap. Breathable glueless band included.',
      imageUrl: '/catalogue/curl.jpg',
      gallery: ['/catalogue/curl.jpg', '/catalogue/deep.jpg'],
      basePriceNgn: 175000,
      basePriceUsd: 118,
      featured: true,
      variants: [
        { sku: 'RH-DC-18-13X4', lengthInches: 18, laceType: '13x4 HD Frontal Unit', colorShade: 'Espresso Black', priceNgn: 175000, priceUsd: 118, totalStock: 5 },
        { sku: 'RH-DC-22-13X6', lengthInches: 22, laceType: '13x6 HD Frontal Unit', colorShade: 'Espresso Black', priceNgn: 225000, priceUsd: 150, totalStock: 4 },
      ],
    },
    {
      slug: 'signature-blunt-bob-unit',
      name: 'Signature Blunt Bob Ready Unit',
      categorySlug: 'ready-units',
      texture: 'Ready Units',
      origin: 'Single-Donor Raw',
      description:
        'Precision razor-cut chin-to-collarbone bob wig with bleached knots, melted hairline, and wear-and-go elastic band.',
      imageUrl: '/catalogue/bob-unit.jpg',
      gallery: ['/catalogue/bob-unit.jpg', '/catalogue/unit.jpg'],
      basePriceNgn: 118000,
      basePriceUsd: 79,
      featured: false,
      variants: [
        { sku: 'RH-BOB-12-5X5', lengthInches: 12, laceType: '5x5 Glueless HD Closure', colorShade: 'Jet Black', priceNgn: 118000, priceUsd: 79, totalStock: 8 },
        { sku: 'RH-BOB-14-13X4', lengthInches: 14, laceType: '13x4 HD Frontal', colorShade: 'Jet Black', priceNgn: 142000, priceUsd: 95, totalStock: 6 },
      ],
    },
    {
      slug: 'riviera-loose-wave-bundles',
      name: 'Riviera Loose Wave Bundles',
      categorySlug: 'loose-wave',
      texture: 'Loose Wave',
      origin: 'Raw Indian Temple',
      description:
        'Airy, romantic loose waves that transition seamlessly from brushed-out volume to sleek flat-ironed silhouettes.',
      imageUrl: '/catalogue/loose.jpg',
      gallery: ['/catalogue/loose.jpg', '/catalogue/hero.jpg'],
      basePriceNgn: 132000,
      basePriceUsd: 88,
      featured: false,
      variants: [
        { sku: 'RH-LW-18-BDL', lengthInches: 18, laceType: '3-Bundle Deal', colorShade: 'Natural 1B', priceNgn: 132000, priceUsd: 88, totalStock: 7 },
        { sku: 'RH-LW-22-BDL', lengthInches: 22, laceType: '3-Bundle Deal', colorShade: 'Natural 1B', priceNgn: 162000, priceUsd: 108, totalStock: 5 },
      ],
    },
    {
      slug: 'coastal-water-wave-bundles',
      name: 'Coastal Water Wave Set',
      categorySlug: 'water-wave',
      texture: 'Water Wave',
      origin: 'Raw Burmese Virgin',
      description:
        'Effortless wet-and-wavy ripple pattern engineered for Port Harcourt humidity without frizz or heaviness.',
      imageUrl: '/catalogue/water.jpg',
      gallery: ['/catalogue/water.jpg', '/catalogue/deep.jpg'],
      basePriceNgn: 138000,
      basePriceUsd: 94,
      featured: false,
      variants: [
        { sku: 'RH-WW-16-5X5', lengthInches: 16, laceType: '5x5 HD Closure + 3 Bundles', colorShade: 'Natural Black', priceNgn: 158000, priceUsd: 105, totalStock: 6 },
        { sku: 'RH-WW-20-5X5', lengthInches: 20, laceType: '5x5 HD Closure + 3 Bundles', colorShade: 'Natural Black', priceNgn: 188000, priceUsd: 125, totalStock: 4 },
      ],
    },
    {
      slug: 'hd-swiss-lace-frontal-closure',
      name: 'Invisible HD Swiss Lace Frontal',
      categorySlug: 'lace',
      texture: 'Lace',
      origin: 'Single-Donor Raw',
      description:
        'Film-grade 0.12mm transparent HD lace hand-knotted with single strands along the hairline for undetectable melts.',
      imageUrl: '/catalogue/frontal.jpg',
      gallery: ['/catalogue/frontal.jpg', '/catalogue/closure.jpg'],
      basePriceNgn: 68000,
      basePriceUsd: 46,
      featured: false,
      variants: [
        { sku: 'RH-LC-16-5X5', lengthInches: 16, laceType: '5x5 HD Closure Only', colorShade: 'Natural 1B', priceNgn: 68000, priceUsd: 46, totalStock: 12 },
        { sku: 'RH-LC-18-13X4', lengthInches: 18, laceType: '13x4 HD Frontal Only', colorShade: 'Natural 1B', priceNgn: 89000, priceUsd: 60, totalStock: 8 },
      ],
    },
    {
      slug: 'caramel-honey-balayage-unit',
      name: 'Caramel Honey Balayage Unit',
      categorySlug: 'colored',
      texture: 'Colored',
      origin: 'Single-Donor Raw (Toned)',
      description:
        'Custom hand-painted warm caramel and honey highlights over espresso roots, protein-sealed for lasting softness.',
      imageUrl: '/catalogue/caramel.jpg',
      gallery: ['/catalogue/caramel.jpg', '/catalogue/honey.jpg'],
      basePriceNgn: 195000,
      basePriceUsd: 130,
      featured: false,
      variants: [
        { sku: 'RH-CH-20-13X4', lengthInches: 20, laceType: '13x4 HD Frontal Unit', colorShade: 'Caramel Honey', priceNgn: 195000, priceUsd: 130, totalStock: 3 },
        { sku: 'RH-CH-24-13X6', lengthInches: 24, laceType: '13x6 HD Frontal Unit', colorShade: 'Honey Blonde', priceNgn: 235000, priceUsd: 156, totalStock: 2 },
      ],
    },
    // Hair Care Products
    {
      slug: 'silk-keratin-elixir-melt-trio',
      name: 'Silk Keratin Elixir & Lace Melt Trio',
      categorySlug: 'hair-care',
      texture: 'Hair Care',
      origin: 'Raw.hairs Botanical Lab',
      description:
        'Cold-pressed argan & keratin gloss serum, flake-free lace melt mist, and moisture-lock masque formulated specifically for virgin wigs and natural hair.',
      imageUrl: '/src/assets/images/care_silk_elixir_1795590466182.jpg',
      gallery: ['/src/assets/images/care_silk_elixir_1795590466182.jpg', '/catalogue/care.jpg'],
      basePriceNgn: 28000,
      basePriceUsd: 20,
      featured: true,
      variants: [
        { sku: 'RH-HC-SERUM', lengthInches: 0, laceType: '100ml Silk Keratin Serum', colorShade: 'Amber Rose', priceNgn: 28000, priceUsd: 20, totalStock: 18 },
        { sku: 'RH-HC-TRIO', lengthInches: 0, laceType: 'Complete 3-Piece Care Set', colorShade: 'Full Kit', priceNgn: 54000, priceUsd: 38, totalStock: 11 },
      ],
    },
    // Styling Tools: Hair Straightener, Curler, Clippers
    {
      slug: 'obsidian-rose-titanium-straightener',
      name: 'Obsidian & Rose Titanium Hair Straightener',
      categorySlug: 'styling-tools',
      texture: 'Styling Tools',
      origin: 'Pro Salon Hardware',
      description:
        'Mirror-smooth floating rose-gold titanium plates heat up in 12 seconds up to 450°F (232°C) for glass-sleek bone straight silk presses without snagging.',
      imageUrl: '/src/assets/images/tool_titanium_straightener_1795590464705.jpg',
      gallery: ['/src/assets/images/tool_titanium_straightener_1795590464705.jpg'],
      basePriceNgn: 65000,
      basePriceUsd: 45,
      featured: true,
      variants: [
        { sku: 'RH-TL-STR-125', lengthInches: 0, laceType: '1.25" Wide Plate · 450°F (NG Plug)', colorShade: 'Obsidian Rose', priceNgn: 65000, priceUsd: 45, totalStock: 10 },
        { sku: 'RH-TL-STR-100', lengthInches: 0, laceType: '1.0" Precision Plate · 450°F (NG Plug)', colorShade: 'Obsidian Rose', priceNgn: 58000, priceUsd: 40, totalStock: 12 },
      ],
    },
    {
      slug: 'champagne-ceramic-barrel-curler',
      name: 'Champagne Ceramic Barrel Hair Curler',
      categorySlug: 'styling-tools',
      texture: 'Styling Tools',
      origin: 'Pro Salon Hardware',
      description:
        'Tourmaline-ceramic digital curler with rapid heat recovery and cool-tip grip for bouncy editorial waves and lasting body-wave curls.',
      imageUrl: '/src/assets/images/tool_ceramic_curler_1795590466057.jpg',
      gallery: ['/src/assets/images/tool_ceramic_curler_1795590466057.jpg'],
      basePriceNgn: 52000,
      basePriceUsd: 36,
      featured: false,
      variants: [
        { sku: 'RH-TL-CRL-32', lengthInches: 0, laceType: '32mm Luxe Wave Barrel + Heat Mat', colorShade: 'Champagne Rose', priceNgn: 52000, priceUsd: 36, totalStock: 9 },
        { sku: 'RH-TL-CRL-25', lengthInches: 0, laceType: '25mm Defined Curl Barrel + Heat Mat', colorShade: 'Champagne Rose', priceNgn: 48000, priceUsd: 33, totalStock: 11 },
      ],
    },
    {
      slug: 'precision-cordless-clipper-shears-kit',
      name: 'Precision Cordless Clipper & Shears Kit',
      categorySlug: 'styling-tools',
      texture: 'Styling Tools',
      origin: 'Pro Salon Hardware',
      description:
        'Whisper-quiet USB-C cordless trimmer clipper paired with balanced Japanese-steel styling shears for crisp blunt bobs, nape cleanups, and lace customization.',
      imageUrl: '/src/assets/images/tool_precision_clipper_1795590465593.jpg',
      gallery: ['/src/assets/images/tool_precision_clipper_1795590465593.jpg'],
      basePriceNgn: 72000,
      basePriceUsd: 49,
      featured: false,
      variants: [
        { sku: 'RH-TL-CLP-KIT', lengthInches: 0, laceType: 'Cordless Clipper + Precision Shears', colorShade: 'Champagne & Matte', priceNgn: 72000, priceUsd: 49, totalStock: 7 },
        { sku: 'RH-TL-CLP-ONLY', lengthInches: 0, laceType: 'Cordless Edge Clipper Only (USB-C)', colorShade: 'Champagne & Matte', priceNgn: 54000, priceUsd: 37, totalStock: 9 },
      ],
    },
  ];

  for (const item of seedCatalog) {
    const [upserted] = await db
      .insert(products)
      .values({
        slug: item.slug,
        name: item.name,
        categorySlug: item.categorySlug,
        texture: item.texture,
        origin: item.origin,
        description: item.description,
        imageUrl: item.imageUrl,
        gallery: item.gallery,
        basePriceNgn: item.basePriceNgn,
        basePriceUsd: item.basePriceUsd,
        featured: item.featured,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: products.slug,
        set: {
          name: item.name,
          categorySlug: item.categorySlug,
          texture: item.texture,
          origin: item.origin,
          description: item.description,
          imageUrl: item.imageUrl,
          gallery: item.gallery,
          basePriceNgn: item.basePriceNgn,
          basePriceUsd: item.basePriceUsd,
          featured: item.featured,
        },
      })
      .returning();

    const productId = upserted.id;
    for (const v of item.variants) {
      await db
        .insert(productVariants)
        .values({
          productId,
          sku: v.sku,
          lengthInches: v.lengthInches,
          laceType: v.laceType,
          colorShade: v.colorShade,
          priceNgn: v.priceNgn,
          priceUsd: v.priceUsd,
          totalStock: v.totalStock,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: productVariants.sku,
          set: {
            productId,
            lengthInches: v.lengthInches,
            laceType: v.laceType,
            colorShade: v.colorShade,
            priceNgn: v.priceNgn,
            priceUsd: v.priceUsd,
          },
        });
    }
  }

  const [{ value: svcCount }] = await db.select({ value: count() }).from(services);
  if (svcCount === 0) {
    await db
      .insert(services)
      .values([
        {
          slug: 'silk-wig-revamp-detox',
          name: 'Silk Wig Revamp & Keratin Detox',
          description:
            'Deep clarifying cleanse, keratin steam conditioning, knot tightening, and silk-press or wand curl styling at our Port Harcourt studio.',
          priceNgn: 18000,
          durationMinutes: 120,
          isActive: true,
        },
        {
          slug: 'hd-frontal-install',
          name: 'Seamless HD Frontal Installation',
          description:
            'Precision braid-down, custom tinting, bleached-knot melt, and tailored baby-hair finish.',
          priceNgn: 25000,
          durationMinutes: 150,
          isActive: true,
        },
        {
          slug: 'custom-wig-coloring',
          name: 'Custom Balayage & Root Toning',
          description:
            'Bespoke coloring for raw virgin bundles—espresso, honey caramel, copper, or jet-black glossing.',
          priceNgn: 32000,
          durationMinutes: 180,
          isActive: true,
        },
        {
          slug: 'closure-reconstruction',
          name: 'Lace Closure Replacement & Styling',
          description:
            'Remove worn lace, hand-ventilate or stitch a fresh 5x5 HD closure, and reshape your unit.',
          priceNgn: 22000,
          durationMinutes: 120,
          isActive: true,
        },
      ])
      .onConflictDoNothing();
  }
}

export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}
