const firstMatch = (ingredients, pattern) => ingredients.find((item) => pattern.test(item));

export function buildPantryRecipeSuggestions(ingredientNames, { dietaryPreference = "No preference", prioritize = [] } = {}) {
  const priority = new Set(prioritize.map((name) => name.toLowerCase()));
  const ingredients = ingredientNames.map((name) => name.trim()).filter(Boolean).sort((a, b) => Number(priority.has(b.toLowerCase())) - Number(priority.has(a.toLowerCase())));
  const pasta = firstMatch(ingredients, /pasta|penne|spaghetti|noodle/i);
  const greens = firstMatch(ingredients, /spinach|kale|broccoli|zucchini|greens/i);
  const tomato = firstMatch(ingredients, /tomato/i);
  const cheese = firstMatch(ingredients, /parmesan|cheese|mozzarella|feta/i);
  const eggs = firstMatch(ingredients, /egg/i);
  const avocado = firstMatch(ingredients, /avocado/i);
  const bread = firstMatch(ingredients, /bread|toast/i);
  const dairy = firstMatch(ingredients, /milk|cream|yogurt/i);
  const oil = firstMatch(ingredients, /oil|butter/i);
  const use = (...items) => items.filter(Boolean);

  const pastaRecipe = pasta
    ? {
        title: greens && tomato ? "Spinach & tomato pantry pasta" : "A good-any-day pantry pasta",
        description: `A quick, flexible bowl with ${use(pasta, greens, tomato, cheese).join(", ")}.`,
        minutes: 20,
        ingredients: use(pasta, greens, tomato, cheese, oil),
        steps: [
          `Cook the ${pasta} in salted water until just tender. Save a mug of pasta water.`,
          `Warm ${oil || "a little oil or butter"} in a pan; soften ${use(tomato, greens).join(" and ") || "any vegetables you have"}.`,
          `Toss in the pasta with a splash of pasta water. Finish with ${cheese || "a little cheese, if you have it"}.`,
        ],
      }
    : {
        title: "A quick pantry skillet",
        description: `A warm, flexible supper built around ${use(greens, tomato, cheese).join(", ") || ingredients.slice(0, 3).join(", ")}.`,
        minutes: 18,
        ingredients: ingredients.slice(0, 4),
        steps: [
          `Chop ${ingredients.slice(0, 3).join(", ") || "a few ingredients from the pantry"} into bite-size pieces.`,
          `Warm ${oil || "a little oil or butter"} in a pan and cook the firmer ingredients first, then add the rest.`,
          `Season to taste and finish with ${cheese || "any herbs or cheese you have"}.`,
        ],
      };

  const eggRecipe = eggs
    ? {
        title: greens || tomato ? "Fridge-sweep frittata" : "Soft-centred pantry omelette",
        description: `Eggs with ${use(greens, tomato, cheese).join(", ") || "whatever bits need using"}.`,
        minutes: 15,
        ingredients: use(eggs, greens, tomato, cheese),
        steps: [
          `Whisk the ${eggs} with a pinch of salt and pepper.`,
          `Cook ${use(greens, tomato).join(" and ") || "any chopped vegetables"} in a small pan until soft.`,
          `Pour in the eggs, add ${cheese || "a little cheese if you like"}, and cook gently until just set.`,
        ],
      }
    : {
        title: "Warm tomato & greens bowl",
        description: `A simple skillet for ${use(tomato, greens, dairy).join(", ") || ingredients.slice(0, 3).join(", ")}.`,
        minutes: 15,
        ingredients: ingredients.slice(0, 4),
        steps: [
          `Warm ${oil || "a little oil or butter"} in a pan and cook ${use(tomato, greens).join(" with ") || "your quickest-cooking ingredients"} until tender.`,
          `Stir through ${cheese || dairy || "a splash of water"} and season well.`,
          `Serve warm on its own or alongside any bread, rice, or pasta you have.`,
        ],
      };

  const avocadoRecipe = avocado && bread
    ? {
        title: "Avocado toast, made a little better",
        description: `Ripe ${avocado} with ${use(tomato, cheese).join(" and ") || "a bright pantry topping"}.`,
        minutes: 10,
        ingredients: use(avocado, bread, tomato, cheese),
        steps: [`Toast the ${bread} until golden.`, `Mash the ${avocado} with salt and pepper, then pile it onto the toast.`, `Top with ${use(tomato, cheese).join(" and ") || "any herbs or crunchy vegetables"}.`],
      }
    : {
        title: "Creamy tomato toast or bowl",
        description: `A quick comfort meal with ${use(tomato, cheese, dairy).join(", ") || ingredients.slice(-3).join(", ")}.`,
        minutes: 12,
        ingredients: use(tomato, cheese, dairy, bread).length ? use(tomato, cheese, dairy, bread) : ingredients.slice(-4),
        steps: [
          `Warm ${tomato || "any vegetables you have"} in a pan with ${oil || "a little oil or butter"}.`,
          `Stir in ${cheese || dairy || "a spoonful of pasta water"} until glossy and season to taste.`,
          `Serve with ${bread || pasta || "whatever is ready to eat"}.`,
        ],
      };

  let recipes = [pastaRecipe, eggRecipe, avocadoRecipe];
  const animal = /egg|milk|cream|yogurt|cheese|parmesan|mozzarella|feta|butter|chicken|fish|salmon|meat|honey/i;
  const gluten = /wheat|bread|toast|pasta|penne|spaghetti|noodle|flour/i;
  if (["Vegan", "Dairy-free"].includes(dietaryPreference)) recipes = recipes.filter((recipe) => !recipe.ingredients.some((name) => /milk|cream|yogurt|cheese|parmesan|mozzarella|feta|butter/i.test(name)) && (dietaryPreference !== "Vegan" || !recipe.ingredients.some((name) => animal.test(name))));
  if (dietaryPreference === "Vegan") recipes = recipes.filter((recipe) => !recipe.ingredients.some((name) => /egg|chicken|fish|salmon|meat|honey/i.test(name)));
  if (dietaryPreference === "Gluten-free") recipes = recipes.filter((recipe) => !recipe.ingredients.some((name) => gluten.test(name)));
  return { recipes };
}
