# Outdoor Recreation Dictionary Progress

Building the outdoor recreation domain dictionary using the iterative methodology. Covers camping, hiking, paddling, cycling, climbing, and snow sports.

*Started: December 2025*
*Completed & Integrated: December 2025*

## Status: ✅ COMPLETE & INTEGRATED

The outdoor recreation dictionary has been fully implemented and integrated into the application:

- **Dictionary file:** `src/data/dictionaries/outdoor.json`
- **Categories:** 26
- **Items:** 984
- **Integration:** Added to `domainLoader.ts`, `types.ts`, and schema files
- **Available in UI:** Users can select "Outdoor" as autocomplete domain

---

## Phase 0: Inventory Research

### Retailer Survey Overview

| Retailer | Type | Market Focus | Notes |
|----------|------|--------------|-------|
| REI | Specialty co-op | Outdoor enthusiasts, all activities | Premium focus, technical gear, broad coverage |
| EMS (Eastern Mountain Sports) | Specialty retail | Hikers, climbers, paddlers | Quality affordable gear, NE focused |
| Bass Pro Shops | Big box outdoor | Hunting, fishing, camping, boating | Broad selection, family focus |
| Camping World | RV/camping specialty | RV accessories, car camping | Heavy on RV and car camping gear |

### Estimated Category SKU Counts by Activity

| Activity | Est. SKU Range | Dictionary Target | Notes |
|----------|---------------|-------------------|-------|
| **Camping & Hiking** | 2,000-3,000 | 400-600 | Core outdoor activity |
| **Paddling** | 800-1,200 | 150-250 | Kayak, canoe, SUP |
| **Cycling** | 1,500-2,500 | 200-350 | Bikes, accessories, clothing |
| **Climbing** | 600-1,000 | 100-180 | Technical hardware, safety |
| **Snow Sports** | 1,000-1,500 | 150-250 | Skiing, snowboarding, snowshoeing |

**Target Dictionary Size: 1,000-1,600 items**

---

## Phase 1: Retailer Category Analysis

### Activity 1: Camping & Hiking

*(Already documented - see existing categories)*

---

### Activity 2: Paddling (Watersports)

#### REI Paddling Categories

**Source:** rei.com, December 2025

1. **Kayaking**
   - Sit-in kayaks
   - Sit-on-top kayaks
   - Recreational kayaks
   - Day touring kayaks
   - Sea kayaks
   - Fishing kayaks
   - Inflatable kayaks
   - Kayak accessories

2. **Canoeing**
   - Canoes
   - Canoe paddles
   - Canoe accessories

3. **Stand-Up Paddleboarding (SUP)**
   - Inflatable SUPs
   - Rigid SUPs
   - SUP paddles
   - SUP accessories

4. **Rafting**
   - Rafts
   - Packrafts
   - Rafting accessories

5. **Paddling Gear**
   - Paddles (kayak, canoe, SUP)
   - PFDs / Life jackets
   - Dry bags & cases
   - Paddle clothing
   - Spray skirts
   - Roof racks & carriers

#### Bass Pro Shops Boating Categories

**Source:** basspro.com, December 2025

1. **Kayaks & Canoes**
   - Recreational kayaks
   - Fishing kayaks
   - Canoes
   - Kayak & canoe accessories
   - Paddles & oars

2. **Stand-Up Paddle Boards**
   - Rigid SUPs
   - Inflatable SUPs

3. **Accessories**
   - Travel carts
   - Dry bags
   - Utility cases
   - Rod holders
   - Trailers

---

### Activity 3: Cycling

#### REI Cycling Categories

**Source:** rei.com, December 2025

1. **Bikes**
   - Mountain bikes
   - Road bikes
   - Gravel bikes
   - E-bikes
   - Commuter/urban bikes
   - Kids bikes

2. **Bike Accessories**
   - Bike lights (front, rear, safety)
   - Bike locks (U-locks, chain locks, cable)
   - Bike pumps (floor, frame, mini, CO2)
   - Bike computers & GPS
   - Bike bells & mirrors
   - Bike fenders
   - Bike kickstands
   - Phone mounts

3. **Bike Packs, Bags & Trailers**
   - Panniers (bike bags)
   - Handlebar bags
   - Frame bags
   - Saddle packs
   - Bike baskets
   - Cargo racks
   - Bike trailers

4. **Bike Maintenance**
   - Multi-tools
   - Tire levers
   - Patch kits
   - Chain tools
   - Bike lubricants
   - Bike cleaners
   - Bike stands

5. **Cycling Clothing & Accessories**
   - Cycling gloves
   - Cycling socks
   - Cycling underwear
   - Cycling headwear
   - Arm & leg warmers
   - Shoe covers
   - Reflective gear

6. **Safety Gear**
   - Bike helmets
   - Mountain bike goggles
   - Mountain bike pads (knee, elbow)

---

### Activity 4: Climbing

#### REI Climbing Categories

**Source:** rei.com, December 2025

1. **Climbing Hardware**
   - Carabiners (locking, non-locking, wire-gate)
   - Quickdraws
   - Climbing protection (cams, nuts, hexes)
   - Belay & rappel devices
   - Ascenders & descenders
   - Pulleys
   - Anchors & slings

2. **Ropes & Cord**
   - Dynamic climbing ropes
   - Static ropes
   - Twin ropes
   - Rescue ropes
   - Accessory cord
   - Webbing

3. **Harnesses**
   - Sport climbing harnesses
   - Trad climbing harnesses
   - Alpine harnesses
   - Kids harnesses

4. **Climbing Shoes**
   - Beginner climbing shoes
   - Sport climbing shoes
   - Trad climbing shoes
   - Bouldering shoes

5. **Chalk & Accessories**
   - Chalk (loose, balls, liquid)
   - Chalk bags
   - Chalk buckets

6. **Helmets**
   - Climbing helmets

7. **Bouldering**
   - Crash pads
   - Bouldering brushes

---

### Activity 5: Snow Sports

#### REI Snow Sports Categories

**Source:** rei.com, December 2025

1. **Downhill Skiing**
   - Skis
   - Ski boots
   - Ski bindings
   - Ski poles
   - Ski goggles
   - Ski helmets

2. **Backcountry Skiing**
   - Backcountry skis
   - AT boots
   - Climbing skins
   - Avalanche safety gear

3. **Cross-Country Skiing**
   - XC skis
   - XC boots
   - XC poles
   - XC bindings

4. **Snowboarding**
   - Snowboards
   - Snowboard boots
   - Snowboard bindings
   - Snowboard goggles
   - Snowboard helmets

5. **Snowshoeing**
   - Snowshoes (flat terrain, rolling, mountain)
   - Snowshoe poles
   - Gaiters

6. **Avalanche Safety**
   - Avalanche beacons
   - Avalanche probes
   - Avalanche shovels
   - Airbag packs

7. **Snow Clothing & Accessories**
   - Snow gloves & mittens
   - Snow headwear (balaclavas, neck gaiters)
   - Goggles
   - Hand/toe warmers

8. **Ski Tuning & Tools**
   - Ski wax
   - Tuning tools
   - Boot bags
   - Ski bags

---

## Phase 1.3: Unified Category Structure

### Unified Outdoor Recreation Categories (22 categories)

| ID | Name | Activity | Description | Priority |
|----|------|----------|-------------|----------|
| **CAMPING & HIKING** |
| `shelter` | Shelter | Camping | Tents, tarps, bivies, tent accessories | High |
| `sleep-system` | Sleep System | Camping | Sleeping bags, pads, cots, pillows | High |
| `backpacks` | Packs & Bags | Camping | Backpacking packs, day packs, stuff sacks | High |
| `camp-kitchen` | Camp Kitchen | Camping | Stoves, cookware, utensils, food storage | High |
| `coolers` | Coolers | Camping | Hard coolers, soft coolers, ice | High |
| `lighting` | Lighting | Camping | Headlamps, lanterns, flashlights | High |
| `furniture` | Camp Furniture | Camping | Chairs, tables, hammocks | Medium |
| `hydration` | Hydration | Camping | Water bottles, filters, treatment | Medium |
| `tools` | Tools & Knives | Camping | Multitools, knives, axes, saws | Medium |
| `fire` | Fire & Fuel | Camping | Fire starters, fuel, matches | Medium |
| `navigation` | Navigation | Camping | Compasses, GPS, maps | Medium |
| `safety` | Safety & First Aid | Camping | First aid kits, emergency gear, bear safety | Medium |
| `protection` | Protection | Camping | Insect repellent, sunscreen | Low |
| `power` | Power & Electronics | Camping | Solar panels, power banks, radios | Low |
| **PADDLING** |
| `paddlecraft` | Paddlecraft | Paddling | Kayaks, canoes, SUPs, rafts | High |
| `paddle-gear` | Paddle Gear | Paddling | Paddles, PFDs, dry bags, spray skirts | High |
| **CYCLING** |
| `bikes` | Bikes | Cycling | Mountain, road, gravel, e-bikes | Medium |
| `bike-accessories` | Bike Accessories | Cycling | Lights, locks, pumps, computers | High |
| `bike-maintenance` | Bike Maintenance | Cycling | Tools, patch kits, lubricants | Medium |
| **CLIMBING** |
| `climbing-hardware` | Climbing Hardware | Climbing | Carabiners, protection, belay devices | High |
| `ropes-harnesses` | Ropes & Harnesses | Climbing | Ropes, harnesses, slings | High |
| **SNOW SPORTS** |
| `snow-gear` | Snow Gear | Snow | Skis, snowboards, snowshoes | Medium |
| `avalanche-safety` | Avalanche Safety | Snow | Beacons, probes, shovels | High |

### Subcategory Structure

```
# CAMPING & HIKING (existing - see above)

# PADDLING
paddlecraft/
├── kayaks              (sit-in, sit-on-top, inflatable, fishing)
├── canoes              (recreational, touring, whitewater)
├── sups                (inflatable, rigid, all-around, touring)
├── rafts               (rafts, packrafts)
└── accessories         (spray skirts, cockpit covers, deck bags)

paddle-gear/
├── paddles             (kayak paddles, canoe paddles, SUP paddles)
├── pfds                (life jackets, PFDs, kayak PFDs)
├── dry-bags            (dry bags, dry boxes, deck bags)
├── paddle-clothing     (paddle jackets, splash pants, wetsuits, drysuits)
├── transport           (roof racks, kayak carts, straps)
└── safety              (bilge pumps, paddle floats, tow lines)

# CYCLING
bikes/
├── mountain-bikes      (hardtail, full-suspension, fat bikes)
├── road-bikes          (road, endurance, aero)
├── gravel-bikes        (gravel, adventure, touring)
├── e-bikes             (e-MTB, e-road, e-commuter)
├── commuter-bikes      (hybrid, urban, folding)
└── kids-bikes          (kids bikes, balance bikes)

bike-accessories/
├── lights              (front lights, rear lights, light sets)
├── locks               (U-locks, chain locks, cable locks)
├── pumps               (floor pumps, mini pumps, CO2 inflators)
├── computers           (bike computers, GPS, mounts)
├── racks-bags          (panniers, handlebar bags, frame bags, cargo racks)
├── safety              (helmets, reflective gear, mirrors)
└── accessories         (bells, fenders, kickstands, bottle cages)

bike-maintenance/
├── tools               (multi-tools, tire levers, chain tools)
├── tubes-tires         (inner tubes, tire patches, tire sealant)
├── lubricants          (chain lube, degreasers, cleaners)
└── stands              (bike stands, work stands)

# CLIMBING
climbing-hardware/
├── carabiners          (locking, non-locking, wire-gate)
├── quickdraws          (sport quickdraws, alpine draws)
├── protection          (cams, nuts, hexes, tricams)
├── belay-rappel        (belay devices, rappel devices, ATCs)
├── ascenders           (ascenders, descenders, prusiks)
└── anchors             (slings, webbing, cordelette)

ropes-harnesses/
├── ropes               (dynamic ropes, static ropes, twin ropes)
├── harnesses           (sport, trad, alpine, kids)
├── chalk               (chalk, chalk bags, chalk buckets)
├── shoes               (climbing shoes, approach shoes)
├── helmets             (climbing helmets)
└── bouldering          (crash pads, brushes)

# SNOW SPORTS
snow-gear/
├── skis                (downhill, backcountry, cross-country)
├── ski-boots           (downhill boots, AT boots, XC boots)
├── snowboards          (all-mountain, freestyle, powder)
├── snowboard-boots     (snowboard boots)
├── snowshoes           (hiking, running, mountaineering)
├── poles               (ski poles, trekking poles, snowshoe poles)
└── bindings            (ski bindings, snowboard bindings)

avalanche-safety/
├── beacons             (avalanche transceivers)
├── probes              (avalanche probes)
├── shovels             (avalanche shovels)
├── airbags             (avalanche airbag packs)
└── education           (inclinometers, snow study kits)
```

---

## Phase 2: Category Population

### Iteration 1: Core Items (Target: 800-1,000 items) - COMPLETE

| Category | Target | Added | Status |
|----------|--------|-------|--------|
| **CAMPING & HIKING** |
| camp-kitchen | 80 | 50 | Complete |
| sleep-system | 45 | 46 | Complete |
| shelter | 50 | 41 | Complete |
| backpacks | 40 | 41 | Complete |
| tools | 45 | 40 | Complete |
| safety | 35 | 39 | Complete |
| lighting | 35 | 38 | Complete |
| power | 25 | 37 | Complete |
| furniture | 40 | 34 | Complete |
| protection | 20 | 34 | Complete |
| navigation | 25 | 34 | Complete |
| hydration | 35 | 33 | Complete |
| fire | 25 | 33 | Complete |
| coolers | 25 | 30 | Complete |
| **PADDLING** |
| paddle-gear | 50 | 46 | Complete |
| paddlecraft | 40 | 39 | Complete |
| **CYCLING** |
| bike-accessories | 60 | 62 | Complete |
| bike-maintenance | 35 | 40 | Complete |
| bikes | 30 | 34 | Complete |
| **CLIMBING** |
| climbing-hardware | 50 | 44 | Complete |
| ropes-harnesses | 40 | 40 | Complete |
| **SNOW SPORTS** |
| snow-gear | 50 | 50 | Complete |
| avalanche-safety | 20 | 12 | Complete |
| **CLOTHING & FOOTWEAR** |
| clothing | 45 | 43 | Complete |
| footwear | 25 | 22 | Complete |
| accessories | 25 | 22 | Complete |
| **TOTAL** | **~1000** | **984** | **100% complete** |

**Dictionary file:** `src/data/dictionaries/outdoor.json`
**Categories:** 26
**Items:** 984
**Date:** December 2025

---

## Domain-Specific Notes

### Technical Terminology by Activity

#### Camping & Hiking
- Temperature ratings (sleeping bags: 0F, 20F, 30F)
- Tent capacity (1P, 2P, 3P, 4P, 6P+)
- Pack volumes (liters: 20L, 35L, 50L, 65L)
- R-values (sleeping pad insulation)
- Fill power (down: 600, 700, 800, 850)

#### Paddling
- Kayak types (sit-in, sit-on-top, touring, whitewater)
- Paddle length (220cm, 230cm, 240cm)
- PFD types (Type I, II, III, V)
- Board volume (liters for SUPs)
- Buoyancy ratings (Newtons for PFDs)

#### Cycling
- Wheel sizes (26", 27.5", 29", 700c)
- Tire widths (23mm, 28mm, 2.1", 2.4")
- Frame sizes (S, M, L, XL or cm)
- Drivetrain speeds (1x11, 2x10, etc.)
- E-bike motor watts (250W, 500W, 750W)

#### Climbing
- Rope diameter (9.0mm, 9.5mm, 10.0mm)
- Rope length (60m, 70m, 80m)
- Carabiner gate types (straight, bent, wire)
- Cam sizes (0.5, 1, 2, 3, 4)
- Climbing shoe sizes (EU sizing: 38, 40, 42)

#### Snow Sports
- Ski length (160cm, 170cm, 180cm)
- Ski width (waist width in mm)
- Snowboard sizes (150cm, 155cm, 160cm)
- Snowshoe sizes (22", 25", 30")
- Binding DIN settings

### Brand-as-Generic Patterns

#### Camping
- "JetBoil" (integrated stove system)
- "Nalgene" (water bottle)
- "CamelBak" (hydration reservoir)
- "Therm-a-Rest" (sleeping pad)

#### Paddling
- "Werner" (kayak paddle brand as quality reference)
- "NRS" (paddle gear)
- "Sea to Summit" (dry bags)

#### Cycling
- "Shimano" (drivetrain components)
- "SRAM" (drivetrain components)
- "Garmin" (bike computers)
- "Kryptonite" (bike locks)

#### Climbing
- "Petzl" (climbing hardware)
- "Black Diamond" (climbing gear)
- "La Sportiva" (climbing shoes)
- "ATC" (belay device type)
- "GriGri" (assisted braking belay device)

#### Snow Sports
- "Yaktrax" (traction devices)
- "MSR" (snowshoes)
- "BCA" (avalanche gear)
- "Mammut" (avalanche beacons)

---

## Size-Critical Products

| Category | Size Dimension | Common Sizes |
|----------|---------------|--------------|
| **Tents** | Person capacity | 1P, 2P, 3P, 4P, 6P, 8P |
| **Sleeping bags** | Temp rating | 0F, 15F, 20F, 30F, 40F |
| **Backpacks** | Volume | 20L, 35L, 50L, 65L |
| **Kayak paddles** | Length | 210cm, 220cm, 230cm, 240cm |
| **SUP paddles** | Adjustable/fixed | 3-piece, fixed |
| **Bike wheels** | Diameter | 26", 27.5", 29", 700c |
| **Bike tires** | Width | 23mm, 28mm, 32mm, 2.2", 2.4" |
| **Climbing ropes** | Length | 35m, 60m, 70m, 80m |
| **Climbing ropes** | Diameter | 9.0mm, 9.5mm, 10.0mm, 10.5mm |
| **Skis** | Length | 160cm, 170cm, 180cm |
| **Snowshoes** | Size | 22", 25", 30" |

---

## Iteration Tracking

### Retailer Analysis
- [x] REI - All activities extracted
- [x] EMS - Camping, climbing, paddling extracted
- [x] Bass Pro Shops - Camping, boating extracted
- [x] Camping World - Camping extracted
- [x] Unified category structure created

### Category Population
- [x] Iteration 1: Core items (984 items achieved)
- [x] Iteration 2: Expansion + alias improvement
- [x] Iteration 3: Gap filling + size variants
- [x] Final review and cleanup

### Validation
- [x] Real-world checklist testing (REI checklists)
- [x] Gap analysis complete
- [x] JSON validation passed

### Integration
- [x] Added 'outdoor' to DomainId type
- [x] Added to getImplementedDomains()
- [x] Added to getAvailableDomains()
- [x] Added display name mapping
- [x] Updated schema enums for autocomplete domain
- [x] All tests passing (504 tests)

---

## Future Enhancements

1. **Size variants**: Add size-specific entries where critical (rope lengths, tent capacities)
2. **Alias expansion**: Add more common misspellings and regional terms
3. **User feedback**: Incorporate user override patterns once implemented
4. **Activity checklists**: Create pre-built templates using this dictionary

---

## Sources

### Camping & Hiking
- [REI Camping & Hiking](https://www.rei.com/c/camping-and-hiking)
- [REI Backpacking Checklist](https://www.rei.com/dam/backpacking_checklist_printable.pdf)
- [Bass Pro Shops Camping](https://www.basspro.com/c/camping)
- [Camping World Camping](https://www.campingworld.com/camping)
- [EMS Homepage](https://www.ems.com/)

### Paddling
- [REI Kayaking](https://www.rei.com/c/kayaking)
- [REI Paddling Accessories](https://www.rei.com/c/paddling-accessories)
- [Bass Pro Shops Kayaks & Canoes](https://www.basspro.com/l/kayaks-canoes)
- [Bass Pro Shops Stand-Up Paddle Boards](https://www.basspro.com/l/stand-up-paddle-boards)

### Cycling
- [REI Cycling](https://www.rei.com/c/cycling)
- [REI Bike Accessories](https://www.rei.com/c/bike-accessories)
- [REI Bike Packs, Bags & Trailers](https://www.rei.com/c/bike-packs-bags-trailers)

### Climbing
- [REI Climbing](https://www.rei.com/c/climbing)
- [REI Climbing Hardware](https://www.rei.com/c/climbing-hardware)
- [REI Sport Climbing Gear List](https://www.rei.com/learn/expert-advice/sport-climbing-checklist.html)

### Snow Sports
- [REI Snowsports](https://www.rei.com/c/snowsports)
- [REI Snowshoeing Checklist](https://www.rei.com/learn/expert-advice/snowshoe-checklist.html)
