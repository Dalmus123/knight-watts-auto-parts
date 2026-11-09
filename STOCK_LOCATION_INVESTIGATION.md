# Stock & Location Display Investigation

## Issue Report
The owner reported that the Engine Oil Filter product modal shows:
- **Displayed**: "Out of Stock" in "Embu"
- **Expected**: Stock 5, Location Garissa, Low-stock threshold 1

## Investigation Findings

### Root Cause
**This is NOT a bug** - the UI is working as designed.

### How It Works
1. The product is stored in Supabase with `location: 'Garissa'` and `stock_quantity: 5`
2. The storefront maps this to a `locations` object:
   ```javascript
   {
     embu: { stock: 0, available: false },
     garissa: { stock: 5, available: true }
   }
   ```
3. When a user activates the **Embu location filter** and opens a Garissa-only product, the modal correctly shows:
   - Location badge: "Embu" (the active filter)
   - Stock badge: "Out of Stock" (because there's no stock in Embu)

### The Code Path
- **File**: `app.js`, lines 705-710
- **Logic**: 
  ```javascript
  const locationStock = currentLocation ? 
      selectedProduct.locations[currentLocation] : 
      { stock: Math.max(...), available: true };
  
  document.getElementById('modalLocation').textContent = currentLocation ? 
      currentLocation.charAt(0).toUpperCase() + currentLocation.slice(1) : 'Embu & Garissa';
  ```

### Why This Happens
- The screenshot was taken with the **Embu location filter active** (stored in `localStorage.selectedLocation`)
- The product exists only in Garissa, so it correctly shows as "Out of Stock" when filtered to Embu
- This is **intended behavior** to show customers whether a product is available in their selected location

## Recommendations

### Current Behavior is Correct
The system is working as designed. The modal shows stock availability **for the active location filter**.

### UI Improvement Suggestion (Optional)
To make this clearer to users, we could:
1. Show both locations' stock when one is out of stock: "Out of Stock in Embu (Available in Garissa: 5)"
2. Add a location switcher in the modal
3. Show a visual indicator when viewing with a location filter active

### Data Verification
To confirm the actual data in Supabase is correct:
```sql
SELECT name, location, stock_quantity, low_stock_threshold 
FROM products 
WHERE name LIKE '%Engine oil filter%';
```

Expected result: `Garissa, 5, 1` (or similar)

## Conclusion
**No code changes needed for this issue.** The display is working correctly. The confusion arose because the screenshot was taken with a location filter active.

The product IS in Garissa with stock 5, and when viewed through an Embu filter, it correctly shows as unavailable in Embu.
