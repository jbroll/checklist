#!/usr/bin/env node
/**
 * Add common grocery staples to dictionary
 * Round 2: More everyday shopping items
 */

const fs = require('fs');
const path = require('path');

const GROCERY_JSON_PATH = path.join(__dirname, '../../src/data/dictionaries/grocery.json');

const grocery = JSON.parse(fs.readFileSync(GROCERY_JSON_PATH, 'utf8'));
const existingNames = new Set(grocery.items.map(i => i.name.toLowerCase()));

let added = 0;

function addItem(item) {
  if (existingNames.has(item.name.toLowerCase())) {
    console.log(`  Skipping: ${item.name}`);
    return false;
  }
  grocery.items.push(item);
  existingNames.add(item.name.toLowerCase());
  added++;
  console.log(`  Added: ${item.name}`);
  return true;
}

console.log('\n=== Pantry Staples ===');

const pantryItems = [
  // Oils & Vinegars
  { name: "extra virgin olive oil", category: "condiments", subcategory: null, aliases: ["evoo", "olive oil"] },
  { name: "vegetable oil", category: "condiments", subcategory: null, aliases: ["cooking oil", "canola oil", "crisco"] },
  { name: "coconut oil", category: "condiments", subcategory: null, aliases: [] },
  { name: "sesame oil", category: "condiments", subcategory: null, aliases: [] },
  { name: "apple cider vinegar", category: "condiments", subcategory: null, aliases: ["acv", "braggs"] },
  { name: "balsamic vinegar", category: "condiments", subcategory: null, aliases: ["balsamic"] },
  { name: "white vinegar", category: "condiments", subcategory: null, aliases: ["distilled vinegar"] },
  { name: "red wine vinegar", category: "condiments", subcategory: null, aliases: [] },

  // Broths & Stocks
  { name: "chicken broth", category: "canned", subcategory: null, aliases: ["chicken stock", "swanson broth"] },
  { name: "beef broth", category: "canned", subcategory: null, aliases: ["beef stock"] },
  { name: "vegetable broth", category: "canned", subcategory: null, aliases: ["vegetable stock", "veggie broth"] },
  { name: "bone broth", category: "canned", subcategory: null, aliases: [] },

  // Canned Tomatoes
  { name: "diced tomatoes", category: "canned", subcategory: null, aliases: ["canned diced tomatoes", "rotel"] },
  { name: "crushed tomatoes", category: "canned", subcategory: null, aliases: ["canned crushed tomatoes"] },
  { name: "tomato sauce", category: "canned", subcategory: null, aliases: ["canned tomato sauce"] },
  { name: "tomato paste", category: "canned", subcategory: null, aliases: [] },
  { name: "stewed tomatoes", category: "canned", subcategory: null, aliases: [] },
  { name: "sun dried tomatoes", category: "canned", subcategory: null, aliases: ["sundried tomatoes"] },

  // Canned Beans
  { name: "black beans", category: "canned", subcategory: null, aliases: ["canned black beans"] },
  { name: "kidney beans", category: "canned", subcategory: null, aliases: ["canned kidney beans", "red kidney beans"] },
  { name: "pinto beans", category: "canned", subcategory: null, aliases: ["canned pinto beans"] },
  { name: "cannellini beans", category: "canned", subcategory: null, aliases: ["white beans", "great northern beans"] },
  { name: "chickpeas", category: "canned", subcategory: null, aliases: ["garbanzo beans", "canned chickpeas"] },
  { name: "refried beans", category: "canned", subcategory: null, aliases: ["canned refried beans"] },
  { name: "baked beans", category: "canned", subcategory: null, aliases: ["bush's baked beans"] },

  // Canned Vegetables
  { name: "canned corn", category: "canned", subcategory: null, aliases: ["corn", "kernel corn", "del monte corn"] },
  { name: "canned green beans", category: "canned", subcategory: null, aliases: ["green beans", "cut green beans"] },
  { name: "canned peas", category: "canned", subcategory: null, aliases: ["sweet peas", "le sueur peas"] },
  { name: "canned carrots", category: "canned", subcategory: null, aliases: ["sliced carrots"] },
  { name: "canned mushrooms", category: "canned", subcategory: null, aliases: ["sliced mushrooms"] },
  { name: "artichoke hearts", category: "canned", subcategory: null, aliases: ["canned artichokes"] },
  { name: "roasted red peppers", category: "canned", subcategory: null, aliases: ["jarred peppers"] },

  // Canned Fish
  { name: "canned tuna", category: "canned", subcategory: null, aliases: ["tuna", "chunk light tuna", "albacore tuna", "starkist", "bumblebee tuna"] },
  { name: "canned salmon", category: "canned", subcategory: null, aliases: ["salmon", "pink salmon"] },
  { name: "canned sardines", category: "canned", subcategory: null, aliases: ["sardines"] },
  { name: "canned anchovies", category: "canned", subcategory: null, aliases: ["anchovies"] },

  // Canned Soup
  { name: "chicken noodle soup", category: "canned", subcategory: null, aliases: ["campbells chicken noodle"] },
  { name: "tomato soup", category: "canned", subcategory: null, aliases: ["campbells tomato soup"] },
  { name: "cream of mushroom soup", category: "canned", subcategory: null, aliases: ["mushroom soup"] },
  { name: "cream of chicken soup", category: "canned", subcategory: null, aliases: [] },
  { name: "minestrone soup", category: "canned", subcategory: null, aliases: ["minestrone"] },
  { name: "clam chowder", category: "canned", subcategory: null, aliases: ["new england clam chowder"] },

  // Nut Butters
  { name: "creamy peanut butter", category: "snacks", subcategory: null, aliases: ["smooth peanut butter", "jif", "skippy", "peter pan"] },
  { name: "crunchy peanut butter", category: "snacks", subcategory: null, aliases: ["chunky peanut butter"] },
  { name: "almond butter", category: "snacks", subcategory: null, aliases: [] },
  { name: "sunflower seed butter", category: "snacks", subcategory: null, aliases: ["sunbutter"] },

  // Jams & Jellies
  { name: "grape jelly", category: "condiments", subcategory: null, aliases: ["welchs grape jelly", "smuckers grape"] },
  { name: "strawberry jam", category: "condiments", subcategory: null, aliases: ["strawberry jelly", "strawberry preserves", "smuckers strawberry"] },
  { name: "raspberry jam", category: "condiments", subcategory: null, aliases: ["raspberry preserves"] },
  { name: "orange marmalade", category: "condiments", subcategory: null, aliases: ["marmalade"] },
  { name: "apple butter", category: "condiments", subcategory: null, aliases: [] },

  // Honey & Sweeteners
  { name: "honey", category: "baking", subcategory: null, aliases: ["raw honey", "local honey"] },
  { name: "maple syrup", category: "baking", subcategory: null, aliases: ["pure maple syrup", "aunt jemima", "mrs butterworth"] },
  { name: "agave", category: "baking", subcategory: null, aliases: ["agave nectar", "agave syrup"] },
  { name: "molasses", category: "baking", subcategory: null, aliases: ["blackstrap molasses"] },
];

for (const item of pantryItems) addItem(item);

console.log('\n=== Frozen Foods ===');

const frozenItems = [
  // Frozen Vegetables
  { name: "frozen broccoli", category: "frozen", subcategory: null, aliases: ["broccoli florets", "birds eye broccoli"] },
  { name: "frozen peas", category: "frozen", subcategory: null, aliases: ["frozen green peas"] },
  { name: "frozen corn", category: "frozen", subcategory: null, aliases: ["frozen sweet corn"] },
  { name: "frozen green beans", category: "frozen", subcategory: null, aliases: ["frozen cut green beans"] },
  { name: "frozen spinach", category: "frozen", subcategory: null, aliases: ["chopped spinach"] },
  { name: "frozen mixed vegetables", category: "frozen", subcategory: null, aliases: ["mixed veggies", "birds eye mixed vegetables"] },
  { name: "frozen stir fry vegetables", category: "frozen", subcategory: null, aliases: ["stir fry mix"] },
  { name: "frozen cauliflower", category: "frozen", subcategory: null, aliases: ["cauliflower florets", "riced cauliflower"] },
  { name: "frozen edamame", category: "frozen", subcategory: null, aliases: ["edamame"] },

  // Frozen Fruits
  { name: "frozen berries", category: "frozen", subcategory: null, aliases: ["frozen mixed berries", "berry blend"] },
  { name: "frozen strawberries", category: "frozen", subcategory: null, aliases: [] },
  { name: "frozen blueberries", category: "frozen", subcategory: null, aliases: [] },
  { name: "frozen mango", category: "frozen", subcategory: null, aliases: ["mango chunks"] },
  { name: "frozen bananas", category: "frozen", subcategory: null, aliases: [] },
  { name: "frozen fruit", category: "frozen", subcategory: null, aliases: ["smoothie fruit"] },

  // Frozen Pizza & Italian
  { name: "frozen pizza", category: "frozen", subcategory: null, aliases: ["digiorno", "red baron", "totinos", "jacks pizza", "tombstone"] },
  { name: "pizza rolls", category: "frozen", subcategory: null, aliases: ["totinos pizza rolls", "bagel bites"] },
  { name: "frozen lasagna", category: "frozen", subcategory: null, aliases: ["stouffers lasagna"] },
  { name: "frozen ravioli", category: "frozen", subcategory: null, aliases: [] },
  { name: "frozen garlic bread", category: "frozen", subcategory: null, aliases: ["texas toast", "garlic toast"] },

  // Frozen Meals
  { name: "frozen dinner", category: "frozen", subcategory: null, aliases: ["tv dinner", "hungry man", "stouffers", "marie callenders", "lean cuisine", "healthy choice"] },
  { name: "hot pockets", category: "frozen", subcategory: null, aliases: ["hot pocket", "lean pockets"] },
  { name: "frozen burritos", category: "frozen", subcategory: null, aliases: ["el monterey", "amy's burrito"] },
  { name: "frozen pot pie", category: "frozen", subcategory: null, aliases: ["chicken pot pie", "marie callenders pot pie"] },
  { name: "frozen egg rolls", category: "frozen", subcategory: null, aliases: ["egg rolls"] },

  // Frozen Breakfast
  { name: "frozen waffles", category: "frozen", subcategory: null, aliases: ["eggo waffles", "eggo", "toaster waffles"] },
  { name: "frozen pancakes", category: "frozen", subcategory: null, aliases: ["microwave pancakes"] },
  { name: "frozen french toast", category: "frozen", subcategory: null, aliases: ["french toast sticks"] },
  { name: "frozen breakfast sandwiches", category: "frozen", subcategory: null, aliases: ["jimmy dean", "hot pockets breakfast"] },
  { name: "frozen hash browns", category: "frozen", subcategory: null, aliases: ["hash browns", "ore ida hash browns"] },
  { name: "frozen tater tots", category: "frozen", subcategory: null, aliases: ["tater tots", "ore ida tater tots"] },

  // Frozen Fries & Potatoes
  { name: "frozen french fries", category: "frozen", subcategory: null, aliases: ["french fries", "fries", "ore ida fries", "crinkle cut fries"] },
  { name: "frozen onion rings", category: "frozen", subcategory: null, aliases: ["onion rings"] },

  // Frozen Meat
  { name: "frozen chicken", category: "frozen", subcategory: null, aliases: ["frozen chicken breasts", "frozen chicken tenders", "tyson chicken"] },
  { name: "frozen fish", category: "frozen", subcategory: null, aliases: ["frozen fish fillets", "gortons fish", "fish sticks"] },
  { name: "frozen shrimp", category: "frozen", subcategory: null, aliases: ["raw shrimp", "cooked shrimp"] },
  { name: "frozen meatballs", category: "frozen", subcategory: null, aliases: ["meatballs"] },
  { name: "frozen burgers", category: "frozen", subcategory: null, aliases: ["frozen hamburger patties", "frozen beef patties"] },
];

for (const item of frozenItems) addItem(item);

console.log('\n=== Deli & Lunch Meat ===');

const deliItems = [
  { name: "sliced turkey", category: "deli", subcategory: null, aliases: ["turkey slices", "deli turkey", "lunch meat turkey", "oscar mayer turkey"] },
  { name: "sliced ham", category: "deli", subcategory: null, aliases: ["ham slices", "deli ham", "lunch meat ham", "oscar mayer ham", "honey ham"] },
  { name: "roast beef", category: "deli", subcategory: null, aliases: ["deli roast beef", "sliced roast beef"] },
  { name: "salami", category: "deli", subcategory: null, aliases: ["hard salami", "genoa salami"] },
  { name: "pepperoni", category: "deli", subcategory: null, aliases: ["sliced pepperoni", "hormel pepperoni"] },
  { name: "prosciutto", category: "deli", subcategory: null, aliases: [] },
  { name: "bologna", category: "deli", subcategory: null, aliases: ["oscar mayer bologna"] },
  { name: "hot dogs", category: "meat", subcategory: null, aliases: ["hotdogs", "franks", "frankfurters", "oscar mayer hot dogs", "hebrew national", "ball park franks"] },
  { name: "italian sausage", category: "meat", subcategory: null, aliases: ["sweet italian sausage", "hot italian sausage"] },
  { name: "bratwurst", category: "meat", subcategory: null, aliases: ["brats", "johnsonville brats"] },
  { name: "kielbasa", category: "meat", subcategory: null, aliases: ["polish sausage", "smoked sausage", "hillshire farms"] },
];

for (const item of deliItems) addItem(item);

console.log('\n=== Baking Essentials ===');

const bakingItems = [
  { name: "all purpose flour", category: "baking", subcategory: null, aliases: ["flour", "ap flour", "white flour", "gold medal flour", "pillsbury flour"] },
  { name: "bread flour", category: "baking", subcategory: null, aliases: [] },
  { name: "whole wheat flour", category: "baking", subcategory: null, aliases: ["wheat flour"] },
  { name: "sugar", category: "baking", subcategory: null, aliases: ["white sugar", "granulated sugar", "cane sugar"] },
  { name: "brown sugar", category: "baking", subcategory: null, aliases: ["light brown sugar", "dark brown sugar"] },
  { name: "powdered sugar", category: "baking", subcategory: null, aliases: ["confectioners sugar", "icing sugar"] },
  { name: "baking soda", category: "baking", subcategory: null, aliases: ["arm and hammer"] },
  { name: "baking powder", category: "baking", subcategory: null, aliases: [] },
  { name: "vanilla extract", category: "baking", subcategory: null, aliases: ["vanilla", "pure vanilla extract"] },
  { name: "almond extract", category: "baking", subcategory: null, aliases: [] },
  { name: "cocoa powder", category: "baking", subcategory: null, aliases: ["unsweetened cocoa", "hersheys cocoa"] },
  { name: "chocolate chips", category: "baking", subcategory: null, aliases: ["semi sweet chocolate chips", "nestle toll house", "ghirardelli chips"] },
  { name: "yeast", category: "baking", subcategory: null, aliases: ["active dry yeast", "instant yeast", "fleischmanns yeast"] },
  { name: "cornstarch", category: "baking", subcategory: null, aliases: ["corn starch"] },
  { name: "cake mix", category: "baking", subcategory: null, aliases: ["betty crocker cake mix", "duncan hines", "pillsbury cake mix"] },
  { name: "brownie mix", category: "baking", subcategory: null, aliases: ["betty crocker brownies", "ghirardelli brownie mix"] },
  { name: "frosting", category: "baking", subcategory: null, aliases: ["icing", "betty crocker frosting", "pillsbury frosting"] },
  { name: "pie crust", category: "baking", subcategory: null, aliases: ["pillsbury pie crust", "frozen pie crust"] },
];

for (const item of bakingItems) addItem(item);

console.log('\n=== Pasta & Rice ===');

const pastaItems = [
  { name: "spaghetti", category: "pasta", subcategory: null, aliases: ["spaghetti noodles", "barilla spaghetti"] },
  { name: "penne", category: "pasta", subcategory: null, aliases: ["penne pasta", "penne rigate"] },
  { name: "macaroni", category: "pasta", subcategory: null, aliases: ["elbow macaroni", "elbow noodles"] },
  { name: "fettuccine", category: "pasta", subcategory: null, aliases: ["fettuccine noodles"] },
  { name: "rotini", category: "pasta", subcategory: null, aliases: ["spiral pasta"] },
  { name: "linguine", category: "pasta", subcategory: null, aliases: [] },
  { name: "lasagna noodles", category: "pasta", subcategory: null, aliases: ["lasagna sheets"] },
  { name: "mac and cheese", category: "pasta", subcategory: null, aliases: ["kraft mac and cheese", "kraft dinner", "macaroni and cheese", "velveeta shells"] },
  { name: "ramen", category: "pasta", subcategory: null, aliases: ["ramen noodles", "instant ramen", "maruchan", "top ramen", "cup noodles"] },
  { name: "white rice", category: "pasta", subcategory: null, aliases: ["long grain rice", "jasmine rice", "basmati rice"] },
  { name: "brown rice", category: "pasta", subcategory: null, aliases: ["whole grain rice"] },
  { name: "instant rice", category: "pasta", subcategory: null, aliases: ["minute rice"] },
  { name: "rice a roni", category: "pasta", subcategory: null, aliases: ["rice-a-roni"] },
  { name: "quinoa", category: "pasta", subcategory: null, aliases: [] },
  { name: "couscous", category: "pasta", subcategory: null, aliases: [] },
];

for (const item of pastaItems) addItem(item);

console.log('\n=== Spices & Seasonings ===');

const spiceItems = [
  { name: "salt", category: "condiments", subcategory: null, aliases: ["table salt", "sea salt", "kosher salt", "morton salt"] },
  { name: "black pepper", category: "condiments", subcategory: null, aliases: ["pepper", "ground pepper", "peppercorns"] },
  { name: "garlic powder", category: "condiments", subcategory: null, aliases: ["garlic"] },
  { name: "onion powder", category: "condiments", subcategory: null, aliases: [] },
  { name: "paprika", category: "condiments", subcategory: null, aliases: ["smoked paprika"] },
  { name: "cumin", category: "condiments", subcategory: null, aliases: ["ground cumin"] },
  { name: "chili powder", category: "condiments", subcategory: null, aliases: [] },
  { name: "italian seasoning", category: "condiments", subcategory: null, aliases: ["italian herbs"] },
  { name: "taco seasoning", category: "condiments", subcategory: null, aliases: ["taco mix", "old el paso seasoning"] },
  { name: "cinnamon", category: "condiments", subcategory: null, aliases: ["ground cinnamon"] },
  { name: "oregano", category: "condiments", subcategory: null, aliases: [] },
  { name: "basil", category: "condiments", subcategory: null, aliases: ["dried basil"] },
  { name: "thyme", category: "condiments", subcategory: null, aliases: [] },
  { name: "rosemary", category: "condiments", subcategory: null, aliases: [] },
  { name: "bay leaves", category: "condiments", subcategory: null, aliases: ["bay leaf"] },
  { name: "red pepper flakes", category: "condiments", subcategory: null, aliases: ["crushed red pepper"] },
  { name: "cayenne pepper", category: "condiments", subcategory: null, aliases: ["cayenne"] },
  { name: "seasoning salt", category: "condiments", subcategory: null, aliases: ["lawrys", "season all"] },
  { name: "lemon pepper", category: "condiments", subcategory: null, aliases: [] },
  { name: "ranch seasoning", category: "condiments", subcategory: null, aliases: ["ranch mix", "hidden valley ranch mix"] },
];

for (const item of spiceItems) addItem(item);

console.log('\n=== Eggs & Breakfast Proteins ===');

const eggItems = [
  { name: "eggs", category: "dairy", subcategory: null, aliases: ["dozen eggs", "large eggs", "cage free eggs", "organic eggs"] },
  { name: "egg whites", category: "dairy", subcategory: null, aliases: ["liquid egg whites"] },
  { name: "breakfast sausage", category: "meat", subcategory: null, aliases: ["sausage links", "sausage patties", "jimmy dean sausage"] },
];

for (const item of eggItems) addItem(item);

// Sort and save
grocery.items.sort((a, b) => a.name.localeCompare(b.name));
grocery.generatedAt = new Date().toISOString().split('T')[0];

fs.writeFileSync(GROCERY_JSON_PATH, JSON.stringify(grocery, null, 2));

console.log(`\n=== Summary ===`);
console.log(`Items added: ${added}`);
console.log(`Total items now: ${grocery.items.length}`);
