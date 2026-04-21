export interface SceneTile {
  category: string;
  options: [string, string, string, string, string, string];
}

export const SCENE_TILES: SceneTile[] = [
  {
    category: "Cause of Death",
    options: ["Suffocation", "Severe Injury", "Loss of Blood", "Illness / Disease", "Poisoning", "Accident"],
  },
  {
    category: "Motive of Crime",
    options: ["Hatred", "Power", "Money", "Love", "Jealousy", "Justice"],
  },
  {
    category: "Weather",
    options: ["Sunny", "Stormy", "Dry", "Humid", "Cold", "Hot"],
  },
  {
    category: "Hint on Corpse",
    options: ["Head", "Chest", "Hand", "Leg", "Partial", "All-over"],
  },
  {
    category: "General Impression",
    options: ["Common", "Creative", "Fishy", "Cruel", "Horrible", "Suspenseful"],
  },
  {
    category: "Corpse Condition",
    options: ["Still Warm", "Stiff", "Decayed", "Incomplete", "Intact", "Twisted"],
  },
  {
    category: "Victim's Identity",
    options: ["Child", "Young Adult", "Middle-Aged", "Senior", "Male", "Female"],
  },
  {
    category: "Murderer's Personality",
    options: ["Arrogant", "Despicable", "Furious", "Greedy", "Forceful", "Perverted"],
  },
  {
    category: "State of the Scene",
    options: ["Bits and Pieces", "Ashes", "Water Stain", "Cracked", "Disorderly", "Tidy"],
  },
  {
    category: "Victim's Build",
    options: ["Large", "Thin", "Tall", "Short", "Disfigured", "Fit"],
  },
  {
    category: "Victim's Clothes",
    options: ["Neat", "Untidy", "Elegant", "Shabby", "Bizarre", "Naked"],
  },
  {
    category: "Evidence Left Behind",
    options: ["Natural", "Artistic", "Written", "Synthetic", "Personal", "Unrelated"],
  },
  {
    category: "Victim's Expression",
    options: ["Peaceful", "Struggling", "Frightened", "In Pain", "Blank", "Angry"],
  },
  {
    category: "Time of Death",
    options: ["Dawn", "Morning", "Noon", "Afternoon", "Evening", "Midnight"],
  },
  {
    category: "Duration of Crime",
    options: ["Instantaneous", "Brief", "Gradual", "Prolonged", "Few Days", "Unclear"],
  },
  {
    category: "Trace at the Scene",
    options: ["Fingerprint", "Footprint", "Bruise", "Blood Stain", "Body Fluid", "Scar"],
  },
  {
    category: "Noticed by Bystander",
    options: ["Sudden Sound", "Prolonged Sound", "Smell", "Visual", "Action", "Nothing"],
  },
  {
    category: "Social Relationship",
    options: ["Relatives", "Friends", "Colleagues", "Employer / Employee", "Lovers", "Strangers"],
  },
  {
    category: "Victim's Occupation",
    options: ["Boss", "Professional", "Worker", "Student", "Unemployed", "Retired"],
  },
  {
    category: "In Progress",
    options: ["Entertainment", "Relaxation", "Assembly", "Trading", "Visit", "Dining"],
  },
];

export const LOCATION_TILES: string[][] = [
  ["Living Room", "Bedroom", "Storeroom", "Bathroom", "Kitchen", "Balcony"],
  ["Vacation Home", "Park", "Supermarket", "School", "Woods", "Bank"],
  ["Pub", "Bookstore", "Restaurant", "Hotel", "Hospital", "Building Site"],
  ["Playground", "Classroom", "Dormitory", "Cafeteria", "Elevator", "Toilet"],
];

export const MEANS_CARDS: string[] = [
  "Alcohol", "Amoeba", "Arsenic", "Arson", "Axe", "Bamboo Tip", "Bat", "Belt",
  "Bite And Tear", "Blender", "Blood Release", "Box Cutter", "Brick", "Bury",
  "Candlestick", "Chainsaw", "Chemicals", "Cleaver", "Crutch", "Dagger",
  "Dirty Water", "Dismember", "Drill", "Drown", "Dumbbell", "E-Bike",
  "Electric Baton", "Electric Current", "Explosives", "Folding Chair", "Gunpowder",
  "Hammer", "Hook", "Ice Skates", "Illegal Drug", "Injection", "Kerosene", "Kick",
  "Knife And Fork", "Lighter", "Liquid Drug", "Locked Room", "Machete", "Machine",
  "Mad Dog", "Match", "Mercury", "Metal Chain", "Metal Wire", "Overdose",
  "Packing Tape", "Pesticide", "Pill", "Pillow", "Pistol", "Plague", "Plastic Bag",
  "Poisonous Gas", "Poisonous Needle", "Potted Plant", "Powder Drug", "Punch",
  "Push", "Radiation", "Razor Blade", "Rope", "Scarf", "Scissors", "Sculpture",
  "Smoke", "Sniper", "Starvation", "Steel Tube", "Stone", "Sulfuric Acid",
  "Surgery", "Throat Slit", "Towel", "Trophy", "Trowel", "Unarmed",
  "Venomous Scorpion", "Venomous Snake", "Video Game Console", "Virus", "Whip",
  "Wine", "Wire", "Work", "Wrench",
];

export const EVIDENCE_CARDS: string[] = [
  "Air Conditioning", "Ants", "Antique", "Apple", "Badge", "Bandage", "Banknote",
  "Bell", "Betting Chips", "Blood", "Bone", "Book", "Bracelet", "Bread", "Briefs",
  "Broom", "Bullet", "Button", "Cake", "Calendar", "Candy", "Carton",
  "Cassette Tape", "Cat", "Certificate", "Chalk", "Cigar", "Cigarette Ash",
  "Cigarette Butt", "Cleaning Cloth", "Cockroach", "Coffee", "Coins", "Comics",
  "Computer", "Computer Disk", "Computer Mouse", "Confidential Letter",
  "Cosmetic Mask", "Cotton", "Cup", "Curtains", "Dentures", "Diamond", "Diary",
  "Dice", "Dictionary", "Dirt", "Documents", "Dog Fur", "Dust", "Earrings", "Eggs",
  "Electric Circuit", "Envelope", "Exam Paper", "Express Courier", "Fan", "Fax",
  "Fiber Optics", "Fingernails", "Flashlight", "Flip-Flop", "Flute", "Flyer",
  "Food Ingredients", "Gear", "Gift", "Gloves", "Glue", "Graffiti", "Hair",
  "Hairpin", "Handcuffs", "Hanger", "Hat", "Headset", "Helmet", "Herbal Medicine",
  "High Heel", "Hourglass", "Ice", "ID Card", "Ink", "Insect", "Internet Cable",
  "Invitation Card", "IOU Note", "Iron", "IV Bag", "Jacket", "Jewelry", "Juice",
  "Key", "Leaf", "Leather Bag", "Leather Shoe", "Lens", "Light Bulb", "Lipstick",
  "Lock", "Lottery Ticket", "Love Letter", "Luggage", "Lunch Box", "Magazine",
  "Mahjong Tiles", "Map", "Mark", "Mask", "Maze", "Menu", "Mirror", "Mobile Phone",
  "Model", "Mosquito", "Mosquito Coil", "Nail", "Name Card", "Necklace",
  "Needle And Thread", "Newspaper", "Note", "Notebook", "Numbers", "Office Supplies",
  "Oil Painting", "Oil Stain", "Paint", "Panties", "Peanut", "Perfume",
  "Photograph", "Plant", "Plastic", "Playing Cards", "Pocket Watch", "Postal Stamp",
  "Powder", "Prescription", "Puppet", "Push Pin", "Puzzle", "Raincoat", "Rat",
  "Receipt", "Red Wine", "Riddle", "Ring", "Rose", "Rubber Stamp", "Sack",
  "Safety Pin", "Sand", "Sawdust", "Seasoning", "Signature", "Skull", "Snacks",
  "Soap", "Sock", "Soft Drink", "Speaker", "Specimen", "Spider", "Spinning Top",
  "Sponge", "Spring", "Steamed Buns", "Stockings", "Stuffed Toy", "Suit",
  "Sunglasses", "Surgical Mask", "Surveillance Camera", "Switch", "Syringe",
  "Table Lamp", "Take-Out", "Tattoo", "Tea Leaves", "Telephone", "Test Tube",
  "Tie", "Timber", "Tissue", "Tool Box", "Toothpicks", "Toy", "Toy Blocks",
  "Tweezers", "Umbrella", "Uniform", "USB Flash Drive", "Vegetables", "Video Camera",
  "Violin", "Wallet", "Watch", "Wig",
];
