#!/usr/bin/env node
/**
 * Add branded food items and aliases to grocery dictionary
 * Based on USDA Branded Food database analysis
 */

const fs = require('fs');
const path = require('path');

const GROCERY_JSON_PATH = path.join(__dirname, '../../src/data/dictionaries/grocery.json');

// Load current dictionary
const grocery = JSON.parse(fs.readFileSync(GROCERY_JSON_PATH, 'utf8'));
const existingNames = new Set(grocery.items.map(i => i.name.toLowerCase()));

// Track additions
let added = 0;
let aliasesAdded = 0;

function addItem(item) {
  if (existingNames.has(item.name.toLowerCase())) {
    console.log(`  Skipping (exists): ${item.name}`);
    return false;
  }
  grocery.items.push(item);
  existingNames.add(item.name.toLowerCase());
  added++;
  return true;
}

function addAliasesToExisting(itemName, newAliases) {
  const item = grocery.items.find(i => i.name.toLowerCase() === itemName.toLowerCase());
  if (!item) {
    console.log(`  Item not found for alias: ${itemName}`);
    return 0;
  }
  const existingAliases = new Set((item.aliases || []).map(a => a.toLowerCase()));
  let count = 0;
  for (const alias of newAliases) {
    if (!existingAliases.has(alias.toLowerCase()) && !existingNames.has(alias.toLowerCase())) {
      item.aliases = item.aliases || [];
      item.aliases.push(alias);
      count++;
    }
  }
  aliasesAdded += count;
  return count;
}

// ============================================================================
// NEW ITEMS TO ADD
// ============================================================================

console.log('\n=== Adding New Beverage Items ===');

const newBeverages = [
  { name: "sparkling water", category: "beverages", subcategory: null, aliases: ["seltzer", "seltzer water", "carbonated water", "la croix", "perrier", "san pellegrino", "bubly", "aha", "spindrift"] },
  { name: "tonic water", category: "beverages", subcategory: null, aliases: ["tonic", "schweppes tonic"] },
  { name: "club soda", category: "beverages", subcategory: null, aliases: ["club", "soda water"] },
  { name: "ginger ale", category: "beverages", subcategory: null, aliases: ["canada dry", "schweppes ginger ale", "seagrams ginger ale"] },
  { name: "ginger beer", category: "beverages", subcategory: null, aliases: ["ginger brew"] },
  { name: "root beer", category: "beverages", subcategory: null, aliases: ["a&w", "barqs", "mug root beer", "ibc root beer"] },
  { name: "cream soda", category: "beverages", subcategory: null, aliases: ["cream pop"] },
  { name: "orange soda", category: "beverages", subcategory: null, aliases: ["fanta", "sunkist", "crush orange"] },
  { name: "grape soda", category: "beverages", subcategory: null, aliases: ["grape crush", "fanta grape", "welchs grape soda"] },
  { name: "lemon lime soda", category: "beverages", subcategory: null, aliases: ["sprite", "7up", "sierra mist", "starry"] },
  { name: "cola", category: "beverages", subcategory: null, aliases: ["coke", "coca cola", "pepsi", "rc cola", "diet coke", "diet pepsi", "coke zero", "pepsi zero"] },
  { name: "energy drink", category: "beverages", subcategory: null, aliases: ["red bull", "monster", "rockstar", "bang", "celsius", "reign", "nos"] },
  { name: "sports drink", category: "beverages", subcategory: null, aliases: ["gatorade", "powerade", "body armor", "propel", "vitamin water"] },
  { name: "iced tea", category: "beverages", subcategory: null, aliases: ["sweet tea", "unsweetened tea", "lipton iced tea", "arizona tea", "snapple", "gold peak"] },
  { name: "lemonade", category: "beverages", subcategory: null, aliases: ["pink lemonade", "minute maid lemonade", "simply lemonade", "country time"] },
  { name: "bottled water", category: "beverages", subcategory: null, aliases: ["spring water", "purified water", "drinking water", "dasani", "aquafina", "poland spring", "deer park", "evian", "fiji"] },
  { name: "coconut water", category: "beverages", subcategory: null, aliases: ["vita coco", "zico"] },
];

for (const item of newBeverages) {
  if (addItem(item)) console.log(`  Added: ${item.name}`);
}

console.log('\n=== Adding New Snack Items ===');

const newSnacks = [
  { name: "potato chips", category: "snacks", subcategory: null, aliases: ["chips", "lays", "ruffles", "pringles", "kettle chips", "cape cod chips", "utz chips", "wise chips"] },
  { name: "tortilla chips", category: "snacks", subcategory: null, aliases: ["tostitos", "mission chips", "late july", "on the border"] },
  { name: "corn chips", category: "snacks", subcategory: null, aliases: ["fritos", "bugles"] },
  { name: "doritos", category: "snacks", subcategory: null, aliases: ["nacho cheese doritos", "cool ranch doritos", "spicy doritos"] },
  { name: "cheetos", category: "snacks", subcategory: null, aliases: ["cheese puffs", "crunchy cheetos", "cheeto puffs", "hot cheetos", "flamin hot cheetos"] },
  { name: "pretzels", category: "snacks", subcategory: null, aliases: ["pretzel sticks", "pretzel twists", "snyders pretzels", "rold gold"] },
  { name: "popcorn", category: "snacks", subcategory: null, aliases: ["microwave popcorn", "kettle corn", "skinny pop", "smartfood", "boom chicka pop"] },
  { name: "veggie chips", category: "snacks", subcategory: null, aliases: ["veggie straws", "terra chips", "sensible portions"] },
  { name: "pita chips", category: "snacks", subcategory: null, aliases: ["stacy's pita chips"] },
  { name: "plantain chips", category: "snacks", subcategory: null, aliases: ["platanitos"] },
  { name: "kale chips", category: "snacks", subcategory: null, aliases: [] },
  { name: "beef jerky", category: "snacks", subcategory: null, aliases: ["jerky", "jack links", "slim jim", "meat sticks"] },
  { name: "trail mix", category: "snacks", subcategory: null, aliases: ["nut mix", "mixed nuts"] },
  { name: "granola bar", category: "snacks", subcategory: null, aliases: ["granola bars", "nature valley", "kind bar", "clif bar", "rxbar", "larabar", "chewy bar"] },
  { name: "protein bar", category: "snacks", subcategory: null, aliases: ["protein bars", "quest bar", "built bar", "one bar", "think bar"] },
  { name: "rice cakes", category: "snacks", subcategory: null, aliases: ["rice cake", "quaker rice cakes"] },
  { name: "crackers", category: "snacks", subcategory: null, aliases: ["ritz", "triscuit", "wheat thins", "cheez its", "goldfish", "club crackers", "saltines"] },
  { name: "cookies", category: "snacks", subcategory: null, aliases: ["oreos", "chips ahoy", "nutter butter", "nilla wafers", "fig newtons", "famous amos"] },
];

for (const item of newSnacks) {
  if (addItem(item)) console.log(`  Added: ${item.name}`);
}

console.log('\n=== Adding New Cereal/Breakfast Items ===');

const newBreakfast = [
  { name: "instant oatmeal", category: "breakfast", subcategory: null, aliases: ["oatmeal packets", "quaker instant oatmeal", "flavored oatmeal"] },
  { name: "quick oats", category: "breakfast", subcategory: null, aliases: ["quick cooking oats", "1 minute oats"] },
  { name: "old fashioned oats", category: "breakfast", subcategory: null, aliases: ["rolled oats", "regular oats"] },
  { name: "steel cut oats", category: "breakfast", subcategory: null, aliases: ["irish oats", "scottish oats", "pinhead oats"] },
  { name: "corn flakes", category: "breakfast", subcategory: null, aliases: ["kelloggs corn flakes", "frosted flakes"] },
  { name: "cheerios", category: "breakfast", subcategory: null, aliases: ["honey nut cheerios", "apple cinnamon cheerios", "multigrain cheerios"] },
  { name: "frosted flakes", category: "breakfast", subcategory: null, aliases: ["frosted corn flakes", "kelloggs frosted flakes"] },
  { name: "raisin bran", category: "breakfast", subcategory: null, aliases: ["kelloggs raisin bran", "post raisin bran"] },
  { name: "lucky charms", category: "breakfast", subcategory: null, aliases: [] },
  { name: "froot loops", category: "breakfast", subcategory: null, aliases: ["fruit loops"] },
  { name: "cinnamon toast crunch", category: "breakfast", subcategory: null, aliases: ["ctc"] },
  { name: "rice krispies", category: "breakfast", subcategory: null, aliases: ["crispy rice", "rice crispies"] },
  { name: "life cereal", category: "breakfast", subcategory: null, aliases: ["life", "quaker life"] },
  { name: "grape nuts", category: "breakfast", subcategory: null, aliases: [] },
  { name: "special k", category: "breakfast", subcategory: null, aliases: ["kelloggs special k"] },
  { name: "honey bunches of oats", category: "breakfast", subcategory: null, aliases: [] },
  { name: "pop tarts", category: "breakfast", subcategory: null, aliases: ["poptarts", "toaster pastries"] },
  { name: "granola", category: "breakfast", subcategory: null, aliases: ["granola cereal", "bear naked granola"] },
  { name: "muesli", category: "breakfast", subcategory: null, aliases: [] },
];

for (const item of newBreakfast) {
  if (addItem(item)) console.log(`  Added: ${item.name}`);
}

console.log('\n=== Adding New Dairy Items ===');

const newDairy = [
  { name: "whole milk", category: "dairy", subcategory: "milk", aliases: ["vitamin d milk", "full fat milk", "regular milk"] },
  { name: "2% milk", category: "dairy", subcategory: "milk", aliases: ["reduced fat milk", "2 percent milk", "two percent milk"] },
  { name: "1% milk", category: "dairy", subcategory: "milk", aliases: ["lowfat milk", "low fat milk", "1 percent milk", "one percent milk"] },
  { name: "skim milk", category: "dairy", subcategory: "milk", aliases: ["fat free milk", "nonfat milk", "non fat milk"] },
  { name: "chocolate milk", category: "dairy", subcategory: "milk", aliases: ["choco milk"] },
  { name: "oat milk", category: "dairy", subcategory: "milk", aliases: ["oatly", "oat beverage", "planet oat"] },
  { name: "almond milk", category: "dairy", subcategory: "milk", aliases: ["almond breeze", "silk almond milk"] },
  { name: "soy milk", category: "dairy", subcategory: "milk", aliases: ["silk soy milk", "soya milk"] },
  { name: "half and half", category: "dairy", subcategory: null, aliases: ["half & half", "coffee creamer"] },
  { name: "heavy cream", category: "dairy", subcategory: null, aliases: ["heavy whipping cream", "whipping cream"] },
  { name: "greek yogurt", category: "dairy", subcategory: "yogurt", aliases: ["chobani", "fage", "oikos", "siggi's"] },
  { name: "cottage cheese", category: "dairy", subcategory: "cheese", aliases: ["curds"] },
  { name: "cream cheese", category: "dairy", subcategory: "cheese", aliases: ["philadelphia cream cheese", "philly cream cheese"] },
  { name: "shredded cheese", category: "dairy", subcategory: "cheese", aliases: ["shredded cheddar", "shredded mozzarella", "mexican blend cheese"] },
  { name: "string cheese", category: "dairy", subcategory: "cheese", aliases: ["cheese sticks", "mozzarella sticks"] },
  { name: "american cheese", category: "dairy", subcategory: "cheese", aliases: ["kraft singles", "cheese slices", "american slices", "velveeta slices"] },
  { name: "cheddar cheese", category: "dairy", subcategory: "cheese", aliases: ["mild cheddar", "sharp cheddar", "extra sharp cheddar", "tillamook", "cabot"] },
  { name: "mozzarella cheese", category: "dairy", subcategory: "cheese", aliases: ["mozzarella", "fresh mozzarella"] },
  { name: "parmesan cheese", category: "dairy", subcategory: "cheese", aliases: ["parmesan", "parmigiano reggiano", "grated parmesan"] },
  { name: "swiss cheese", category: "dairy", subcategory: "cheese", aliases: ["swiss", "baby swiss", "jarlsberg"] },
  { name: "pepper jack cheese", category: "dairy", subcategory: "cheese", aliases: ["pepper jack", "jalapeno cheese"] },
  { name: "feta cheese", category: "dairy", subcategory: "cheese", aliases: ["feta", "crumbled feta"] },
  { name: "brie cheese", category: "dairy", subcategory: "cheese", aliases: ["brie"] },
  { name: "gouda cheese", category: "dairy", subcategory: "cheese", aliases: ["gouda", "smoked gouda"] },
  { name: "blue cheese", category: "dairy", subcategory: "cheese", aliases: ["bleu cheese", "gorgonzola", "roquefort"] },
  { name: "butter", category: "dairy", subcategory: null, aliases: ["salted butter", "unsalted butter", "land o lakes", "kerrygold", "irish butter"] },
  { name: "margarine", category: "dairy", subcategory: null, aliases: ["i cant believe its not butter", "country crock", "parkay"] },
  { name: "sour cream", category: "dairy", subcategory: null, aliases: ["daisy sour cream"] },
  { name: "whipped cream", category: "dairy", subcategory: null, aliases: ["reddi wip", "cool whip", "whipped topping"] },
  { name: "evaporated milk", category: "dairy", subcategory: null, aliases: ["carnation evaporated milk"] },
  { name: "condensed milk", category: "dairy", subcategory: null, aliases: ["sweetened condensed milk", "eagle brand"] },
];

for (const item of newDairy) {
  if (addItem(item)) console.log(`  Added: ${item.name}`);
}

console.log('\n=== Adding New Candy & Chocolate Items ===');

const newCandy = [
  { name: "m&ms", category: "snacks", subcategory: null, aliases: ["mms", "peanut m&ms", "m and ms"] },
  { name: "snickers", category: "snacks", subcategory: null, aliases: ["snickers bar"] },
  { name: "twix", category: "snacks", subcategory: null, aliases: ["twix bar"] },
  { name: "milky way", category: "snacks", subcategory: null, aliases: ["milky way bar"] },
  { name: "reeses", category: "snacks", subcategory: null, aliases: ["reese's", "reeses cups", "reese's peanut butter cups", "reeses pieces"] },
  { name: "kit kat", category: "snacks", subcategory: null, aliases: ["kitkat", "kit-kat"] },
  { name: "hersheys", category: "snacks", subcategory: null, aliases: ["hershey's", "hershey bar", "hersheys kisses", "hershey kisses"] },
  { name: "skittles", category: "snacks", subcategory: null, aliases: [] },
  { name: "starburst", category: "snacks", subcategory: null, aliases: [] },
  { name: "swedish fish", category: "snacks", subcategory: null, aliases: [] },
  { name: "sour patch kids", category: "snacks", subcategory: null, aliases: ["sour patch"] },
  { name: "gummy bears", category: "snacks", subcategory: null, aliases: ["haribo", "gummy worms", "gummies"] },
  { name: "jolly ranchers", category: "snacks", subcategory: null, aliases: ["jolly rancher"] },
  { name: "twizzlers", category: "snacks", subcategory: null, aliases: ["red vines", "licorice"] },
  { name: "nerds", category: "snacks", subcategory: null, aliases: ["nerds candy"] },
  { name: "airheads", category: "snacks", subcategory: null, aliases: [] },
  { name: "laffy taffy", category: "snacks", subcategory: null, aliases: [] },
  { name: "mike and ikes", category: "snacks", subcategory: null, aliases: ["mike and ike"] },
  { name: "tootsie rolls", category: "snacks", subcategory: null, aliases: ["tootsie roll", "tootsie pops"] },
  { name: "lifesavers", category: "snacks", subcategory: null, aliases: ["life savers"] },
  { name: "tic tacs", category: "snacks", subcategory: null, aliases: ["tic tac"] },
  { name: "altoids", category: "snacks", subcategory: null, aliases: [] },
  { name: "lindt chocolate", category: "snacks", subcategory: null, aliases: ["lindt", "lindor", "lindt truffles"] },
  { name: "ghirardelli chocolate", category: "snacks", subcategory: null, aliases: ["ghirardelli", "ghirardelli squares"] },
  { name: "godiva chocolate", category: "snacks", subcategory: null, aliases: ["godiva"] },
  { name: "ferrero rocher", category: "snacks", subcategory: null, aliases: ["ferrero"] },
  { name: "nutella", category: "snacks", subcategory: null, aliases: ["hazelnut spread"] },
];

for (const item of newCandy) {
  if (addItem(item)) console.log(`  Added: ${item.name}`);
}

console.log('\n=== Adding New Condiments ===');

const newCondiments = [
  { name: "ketchup", category: "condiments", subcategory: null, aliases: ["catsup", "heinz ketchup", "hunts ketchup"] },
  { name: "mustard", category: "condiments", subcategory: null, aliases: ["yellow mustard", "dijon mustard", "french's mustard", "guldens", "spicy brown mustard"] },
  { name: "mayonnaise", category: "condiments", subcategory: null, aliases: ["mayo", "hellmanns", "dukes mayo", "best foods mayo", "miracle whip"] },
  { name: "ranch dressing", category: "condiments", subcategory: null, aliases: ["ranch", "hidden valley ranch"] },
  { name: "italian dressing", category: "condiments", subcategory: null, aliases: ["italian"] },
  { name: "bbq sauce", category: "condiments", subcategory: null, aliases: ["barbecue sauce", "sweet baby rays", "stubbs bbq", "kc masterpiece"] },
  { name: "hot sauce", category: "condiments", subcategory: null, aliases: ["tabasco", "franks red hot", "sriracha", "cholula", "louisiana hot sauce", "texas pete"] },
  { name: "soy sauce", category: "condiments", subcategory: null, aliases: ["kikkoman", "low sodium soy sauce", "tamari"] },
  { name: "teriyaki sauce", category: "condiments", subcategory: null, aliases: ["teriyaki", "kikkoman teriyaki"] },
  { name: "worcestershire sauce", category: "condiments", subcategory: null, aliases: ["worcestershire", "lea & perrins"] },
  { name: "steak sauce", category: "condiments", subcategory: null, aliases: ["a1 sauce", "a1", "heinz 57"] },
  { name: "salsa", category: "condiments", subcategory: null, aliases: ["pace salsa", "tostitos salsa", "chi-chis salsa", "pico de gallo"] },
  { name: "guacamole", category: "condiments", subcategory: null, aliases: ["guac", "avocado dip"] },
  { name: "hummus", category: "condiments", subcategory: null, aliases: ["sabra", "chickpea dip"] },
  { name: "pasta sauce", category: "condiments", subcategory: null, aliases: ["marinara", "spaghetti sauce", "ragu", "prego", "barilla sauce", "classico", "newmans own"] },
  { name: "alfredo sauce", category: "condiments", subcategory: null, aliases: ["alfredo"] },
  { name: "pizza sauce", category: "condiments", subcategory: null, aliases: [] },
  { name: "pesto", category: "condiments", subcategory: null, aliases: ["basil pesto"] },
  { name: "relish", category: "condiments", subcategory: null, aliases: ["sweet relish", "dill relish", "pickle relish"] },
  { name: "pickles", category: "condiments", subcategory: null, aliases: ["dill pickles", "bread and butter pickles", "kosher pickles", "vlasic", "claussen"] },
  { name: "olives", category: "condiments", subcategory: null, aliases: ["black olives", "green olives", "kalamata olives", "stuffed olives"] },
  { name: "capers", category: "condiments", subcategory: null, aliases: [] },
  { name: "horseradish", category: "condiments", subcategory: null, aliases: ["prepared horseradish"] },
  { name: "tartar sauce", category: "condiments", subcategory: null, aliases: [] },
  { name: "cocktail sauce", category: "condiments", subcategory: null, aliases: ["seafood sauce"] },
];

for (const item of newCondiments) {
  if (addItem(item)) console.log(`  Added: ${item.name}`);
}

console.log('\n=== Adding New Ice Cream Items ===');

const newIceCream = [
  { name: "vanilla ice cream", category: "frozen", subcategory: null, aliases: ["vanilla"] },
  { name: "chocolate ice cream", category: "frozen", subcategory: null, aliases: [] },
  { name: "strawberry ice cream", category: "frozen", subcategory: null, aliases: [] },
  { name: "mint chocolate chip ice cream", category: "frozen", subcategory: null, aliases: ["mint chip"] },
  { name: "cookies and cream ice cream", category: "frozen", subcategory: null, aliases: ["cookies n cream"] },
  { name: "ben and jerrys", category: "frozen", subcategory: null, aliases: ["ben & jerry's", "ben jerry's", "cherry garcia", "half baked", "phish food"] },
  { name: "haagen dazs", category: "frozen", subcategory: null, aliases: ["haagen-dazs"] },
  { name: "talenti", category: "frozen", subcategory: null, aliases: ["talenti gelato"] },
  { name: "ice cream sandwiches", category: "frozen", subcategory: null, aliases: ["ice cream sandwich", "klondike bar"] },
  { name: "popsicles", category: "frozen", subcategory: null, aliases: ["freezer pops", "ice pops", "otter pops", "fla-vor-ice"] },
  { name: "frozen yogurt", category: "frozen", subcategory: null, aliases: ["froyo"] },
  { name: "sorbet", category: "frozen", subcategory: null, aliases: ["fruit sorbet"] },
  { name: "gelato", category: "frozen", subcategory: null, aliases: [] },
];

for (const item of newIceCream) {
  if (addItem(item)) console.log(`  Added: ${item.name}`);
}

console.log('\n=== Adding New Bread Items ===');

const newBread = [
  { name: "white bread", category: "bakery", subcategory: null, aliases: ["wonder bread", "sandwich bread"] },
  { name: "wheat bread", category: "bakery", subcategory: null, aliases: ["whole wheat bread", "100% whole wheat"] },
  { name: "sourdough bread", category: "bakery", subcategory: null, aliases: ["sourdough", "san francisco sourdough"] },
  { name: "rye bread", category: "bakery", subcategory: null, aliases: ["rye"] },
  { name: "italian bread", category: "bakery", subcategory: null, aliases: [] },
  { name: "french bread", category: "bakery", subcategory: null, aliases: ["baguette", "french baguette"] },
  { name: "ciabatta", category: "bakery", subcategory: null, aliases: ["ciabatta bread", "ciabatta rolls"] },
  { name: "brioche", category: "bakery", subcategory: null, aliases: ["brioche buns"] },
  { name: "english muffins", category: "bakery", subcategory: null, aliases: ["english muffin", "thomas english muffins"] },
  { name: "bagels", category: "bakery", subcategory: null, aliases: ["bagel", "everything bagels", "plain bagels"] },
  { name: "croissants", category: "bakery", subcategory: null, aliases: ["croissant"] },
  { name: "hamburger buns", category: "bakery", subcategory: null, aliases: ["burger buns", "sesame buns"] },
  { name: "hot dog buns", category: "bakery", subcategory: null, aliases: ["hotdog buns"] },
  { name: "dinner rolls", category: "bakery", subcategory: null, aliases: ["rolls", "kings hawaiian", "hawaiian rolls"] },
  { name: "tortillas", category: "bakery", subcategory: null, aliases: ["flour tortillas", "corn tortillas", "mission tortillas"] },
  { name: "pita bread", category: "bakery", subcategory: null, aliases: ["pita", "pita pockets"] },
  { name: "naan", category: "bakery", subcategory: null, aliases: ["naan bread", "garlic naan"] },
  { name: "flatbread", category: "bakery", subcategory: null, aliases: ["flatbreads"] },
];

for (const item of newBread) {
  if (addItem(item)) console.log(`  Added: ${item.name}`);
}

console.log('\n=== Adding New Coffee/Tea Items ===');

const newCoffee = [
  { name: "ground coffee", category: "beverages", subcategory: null, aliases: ["coffee grounds", "folgers", "maxwell house", "dunkin coffee", "starbucks coffee", "peets coffee"] },
  { name: "coffee beans", category: "beverages", subcategory: null, aliases: ["whole bean coffee", "whole beans"] },
  { name: "k-cups", category: "beverages", subcategory: null, aliases: ["k cups", "keurig pods", "coffee pods", "kcups"] },
  { name: "instant coffee", category: "beverages", subcategory: null, aliases: ["nescafe", "folgers instant"] },
  { name: "cold brew", category: "beverages", subcategory: null, aliases: ["cold brew coffee", "stok cold brew", "chameleon cold brew"] },
  { name: "coffee creamer", category: "beverages", subcategory: null, aliases: ["creamer", "coffee mate", "international delight", "french vanilla creamer"] },
  { name: "black tea", category: "beverages", subcategory: null, aliases: ["lipton tea", "english breakfast tea"] },
  { name: "green tea", category: "beverages", subcategory: null, aliases: ["matcha", "jasmine green tea"] },
  { name: "herbal tea", category: "beverages", subcategory: null, aliases: ["chamomile tea", "peppermint tea", "sleepytime tea", "celestial seasonings"] },
  { name: "chai tea", category: "beverages", subcategory: null, aliases: ["chai", "chai latte"] },
];

for (const item of newCoffee) {
  if (addItem(item)) console.log(`  Added: ${item.name}`);
}

// ============================================================================
// ADD ALIASES TO EXISTING ITEMS
// ============================================================================

console.log('\n=== Adding Aliases to Existing Items ===');

// Cereal brands
addAliasesToExisting("cereal", ["breakfast cereal", "kelloggs", "general mills", "post", "quaker"]);

// Yogurt brands
addAliasesToExisting("yogurt", ["dannon", "yoplait", "activia", "stonyfield"]);

// Juice brands
addAliasesToExisting("orange juice", ["oj", "tropicana", "simply orange", "minute maid", "florida's natural"]);
addAliasesToExisting("apple juice", ["mott's", "martinelli's"]);
addAliasesToExisting("grape juice", ["welch's", "welchs"]);

// Water brands
addAliasesToExisting("water", ["bottled water", "spring water"]);

// ============================================================================
// SAVE UPDATED DICTIONARY
// ============================================================================

// Sort items by name for consistency
grocery.items.sort((a, b) => a.name.localeCompare(b.name));

// Update metadata
grocery.generatedAt = new Date().toISOString().split('T')[0];
grocery.source = "USDA FoodData Central SR Legacy + Branded Foods + manual curation";

fs.writeFileSync(GROCERY_JSON_PATH, JSON.stringify(grocery, null, 2));

console.log(`\n=== Summary ===`);
console.log(`Items added: ${added}`);
console.log(`Aliases added to existing items: ${aliasesAdded}`);
console.log(`Total items now: ${grocery.items.length}`);
console.log(`\nSaved to: ${GROCERY_JSON_PATH}`);
