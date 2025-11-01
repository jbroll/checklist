import { describe, expect, it } from 'vitest';
import { autoCategorize, CATEGORIES, type Category } from './index';

describe('Schema Utilities', () => {
  describe('autoCategorize', () => {
    it('should categorize produce items correctly', () => {
      expect(autoCategorize('apples')).toBe('produce');
      expect(autoCategorize('Banana')).toBe('produce');
      expect(autoCategorize('fresh oranges')).toBe('produce');
      expect(autoCategorize('Lettuce')).toBe('produce');
      expect(autoCategorize('tomatoes')).toBe('produce');
      expect(autoCategorize('carrots')).toBe('produce');
      expect(autoCategorize('onions')).toBe('produce');
      expect(autoCategorize('potatoes')).toBe('produce');
    });

    it('should categorize dairy items correctly', () => {
      expect(autoCategorize('milk')).toBe('dairy');
      expect(autoCategorize('Cheese')).toBe('dairy');
      expect(autoCategorize('greek yogurt')).toBe('dairy');
      expect(autoCategorize('Butter')).toBe('dairy');
      expect(autoCategorize('heavy cream')).toBe('dairy');
    });

    it('should categorize meat items correctly', () => {
      expect(autoCategorize('chicken breast')).toBe('meat');
      expect(autoCategorize('Ground Beef')).toBe('meat');
      expect(autoCategorize('pork chops')).toBe('meat');
      expect(autoCategorize('Salmon fish')).toBe('meat');
      expect(autoCategorize('turkey')).toBe('meat');
      expect(autoCategorize('bacon')).toBe('meat');
      expect(autoCategorize('steak')).toBe('meat');
    });

    it('should categorize frozen items correctly', () => {
      expect(autoCategorize('frozen peas')).toBe('frozen');
      expect(autoCategorize('Ice Cream')).toBe('frozen');
      expect(autoCategorize('popsicles')).toBe('frozen');
    });

    it('should categorize bakery items correctly', () => {
      expect(autoCategorize('bread')).toBe('bakery');
      expect(autoCategorize('Bagels')).toBe('bakery');
      expect(autoCategorize('muffins')).toBe('bakery');
      expect(autoCategorize('Cake')).toBe('bakery');
      expect(autoCategorize('cookies')).toBe('bakery');
      expect(autoCategorize('pastry')).toBe('bakery');
    });

    it('should categorize beverages correctly', () => {
      expect(autoCategorize('coffee')).toBe('beverages');
      expect(autoCategorize('Green Tea')).toBe('beverages');
      expect(autoCategorize('soda')).toBe('beverages');
      expect(autoCategorize('Orange Juice')).toBe('beverages');
      expect(autoCategorize('bottled water')).toBe('beverages');
      expect(autoCategorize('beer')).toBe('beverages');
      expect(autoCategorize('wine')).toBe('beverages');
    });

    it('should categorize household items correctly', () => {
      expect(autoCategorize('dish soap')).toBe('household');
      expect(autoCategorize('Laundry Detergent')).toBe('household');
      expect(autoCategorize('all-purpose cleaner')).toBe('household');
      expect(autoCategorize('Paper Towels')).toBe('household');
      expect(autoCategorize('toilet paper')).toBe('household');
      expect(autoCategorize('trash bags')).toBe('household');
    });

    it('should categorize pantry items correctly', () => {
      expect(autoCategorize('rice')).toBe('pantry');
      expect(autoCategorize('Pasta')).toBe('pantry');
      expect(autoCategorize('cereal')).toBe('pantry');
      expect(autoCategorize('Flour')).toBe('pantry');
      expect(autoCategorize('sugar')).toBe('pantry');
      expect(autoCategorize('salt')).toBe('pantry');
      expect(autoCategorize('olive oil')).toBe('pantry');
      expect(autoCategorize('tomato sauce')).toBe('pantry');
      expect(autoCategorize('canned beans')).toBe('pantry');
    });

    it("should default to 'other' for unrecognized items", () => {
      expect(autoCategorize('batteries')).toBe('other');
      expect(autoCategorize('Random Item')).toBe('other');
      expect(autoCategorize('something unusual')).toBe('other');
    });

    it('should be case-insensitive', () => {
      expect(autoCategorize('MILK')).toBe('dairy');
      expect(autoCategorize('mILk')).toBe('dairy');
      expect(autoCategorize('BREAD')).toBe('bakery');
      expect(autoCategorize('BrEaD')).toBe('bakery');
    });

    it('should handle items with multiple keywords', () => {
      // Should match first applicable category
      expect(autoCategorize('frozen chicken')).toBe('frozen'); // frozen comes before meat in the function
      expect(autoCategorize('bread with cheese')).toBe('bakery'); // bakery comes before dairy
    });
  });

  describe('CATEGORIES constant', () => {
    it('should have all required categories', () => {
      const expectedCategories: Category[] = [
        'produce',
        'dairy',
        'meat',
        'pantry',
        'frozen',
        'household',
        'bakery',
        'beverages',
        'other',
      ];

      for (const category of expectedCategories) {
        expect(CATEGORIES[category]).toBeDefined();
      }
    });

    it('should have correct structure for each category', () => {
      for (const category of Object.keys(CATEGORIES) as Category[]) {
        const categoryInfo = CATEGORIES[category];
        expect(categoryInfo).toHaveProperty('name');
        expect(categoryInfo).toHaveProperty('icon');
        expect(categoryInfo).toHaveProperty('color');
        expect(typeof categoryInfo.name).toBe('string');
        expect(typeof categoryInfo.icon).toBe('string');
        expect(typeof categoryInfo.color).toBe('string');
      }
    });

    it('should have unique colors for each category', () => {
      const colors = Object.values(CATEGORIES).map((cat) => cat.color);
      const uniqueColors = new Set(colors);
      expect(colors.length).toBe(uniqueColors.size);
    });

    it('should have emojis as icons', () => {
      for (const category of Object.keys(CATEGORIES) as Category[]) {
        const icon = CATEGORIES[category].icon;
        // Emojis should be 1-2 characters (some emojis use 2 code points)
        expect(icon.length).toBeGreaterThanOrEqual(1);
        expect(icon.length).toBeLessThanOrEqual(2);
      }
    });
  });
});
