# Testing Guide: Add Product Feature

## Prerequisites

### 1. Supabase Storage Bucket Setup

The `products` storage bucket must be created in Supabase Dashboard before testing:

1. Go to your Supabase project: https://supabase.com/dashboard/project/selvxrprxbkznxtfesxe
2. Navigate to **Storage** in the left sidebar
3. Click **New Bucket**
4. Create bucket with these settings:
   - **Name**: `products`
   - **Public**: Yes (enable public read access)
   - **File size limit**: 5 MB
   - **Allowed MIME types**: `image/*`

5. Set up Storage Policies:
   - Go to **Policies** tab in the `products` bucket
   - Add policy for **INSERT**:
     ```sql
     -- Allow owner/admin to upload
     CREATE POLICY "owner_admin_upload_products"
     ON storage.objects FOR INSERT
     TO authenticated
     WITH CHECK (
       bucket_id = 'products' AND
       auth.uid() IN (
         SELECT id FROM user_profiles 
         WHERE role IN ('owner', 'admin')
       )
     );
     ```
   - Add policy for **SELECT** (Public read):
     ```sql
     -- Public read access
     CREATE POLICY "public_read_products"
     ON storage.objects FOR SELECT
     TO public
     USING (bucket_id = 'products');
     ```
   - Add policy for **DELETE**:
     ```sql
     -- Allow owner/admin to delete
     CREATE POLICY "owner_admin_delete_products"
     ON storage.objects FOR DELETE
     TO authenticated
     USING (
       bucket_id = 'products' AND
       auth.uid() IN (
         SELECT id FROM user_profiles 
         WHERE role IN ('owner', 'admin')
       )
     );
     ```

### 2. Test User Setup

Ensure you have an admin/owner account configured in the `user_profiles` table.

## Testing Instructions

### Test 1: Add New Product

1. Navigate to https://dalmus123.github.io/knight-watts-auto-parts/admin/
2. Sign in with owner/admin credentials
3. Click **Products** in the left sidebar
4. Click **Add Product** button (top right)

5. Fill in the form:
   - **Product Name**: "Test Brake Pads"
   - **Category**: "Brake System"
   - **Location**: "Embu"
   - **Price (KES)**: 3500.00
   - **Stock Quantity**: 25
   - **Description**: "High-quality ceramic brake pads for Toyota vehicles"
   - **SKU**: "BP-TEST-001"
   - **Low Stock Threshold**: 5
   - **Manufacturer**: "Bosch"
   - **Part Number**: "0 986 494 123"
   - **Image**: Upload any product image (JPG/PNG < 5MB)
   - Check **Product is Active**
   - Check **3D Model** (if applicable)

6. Click **Save Product**

**Expected Result**:
- Success message appears
- Product appears in the products table
- Image is visible in Supabase Storage at `products/{productId}/{filename}`
- Product is visible on the public storefront (if active)

### Test 2: Edit Product

1. In the Products table, click **Edit** on the test product
2. Modify fields:
   - Change **Price** to 3750.00
   - Change **Stock Quantity** to 20
   - Optionally upload a new image
3. Click **Update Product**

**Expected Result**:
- Success message appears
- Changes reflected in the products table
- Old image replaced if new one uploaded

### Test 3: Product Listing

1. Verify the product appears correctly in the table with:
   - Correct name, category, price
   - Stock quantity with warning icon if below threshold
   - Location
   - Active/Inactive status badge
   - Edit button

### Test 4: Delete Product

1. Click **Edit** on the test product
2. Click **Delete Product** (red button, bottom left)
3. Confirm deletion in the dialog

**Expected Result**:
- Product removed from table
- Image deleted from Supabase Storage
- Modal closes automatically

### Test 5: Image Upload Validation

1. Click **Add Product**
2. Try uploading:
   - A non-image file (e.g., .pdf)
   - An image larger than 5MB
   
**Expected Result**:
- Error messages for invalid files
- Form prevents submission with invalid image

### Test 6: Required Field Validation

1. Click **Add Product**
2. Try submitting without filling required fields
3. Leave fields empty one by one

**Expected Result**:
- Browser validation prevents submission
- Required fields highlighted

### Test 7: Product Filtering

1. Create multiple products with different categories
2. Use the search box to filter products
3. Verify filtering works

### Test 8: Stock Warning

1. Create a product with stock quantity <= low_stock_threshold
2. Verify warning icon (⚠️) appears in the stock column

### Test 9: Inactive Product

1. Edit a product and uncheck **Product is Active**
2. Save
3. Verify product shows "Inactive" status badge
4. Check that it's hidden from public storefront

### Test 10: RLS Permissions

1. Sign in with a non-admin user (if available)
2. Verify they cannot access Products page
3. Should see "Access Denied" message

## Error Scenarios

### Scenario 1: Storage Bucket Not Created
**Symptom**: Upload fails with storage error  
**Solution**: Create `products` bucket in Supabase Dashboard

### Scenario 2: RLS Policy Missing
**Symptom**: 403 Forbidden on upload or delete  
**Solution**: Add storage policies as documented above

### Scenario 3: Duplicate SKU
**Symptom**: Error when saving product with existing SKU  
**Expected**: Clear error message about duplicate SKU

### Scenario 4: Network Error
**Symptom**: Save fails due to network issues  
**Expected**: Error message displayed, form not cleared

## Success Criteria

✅ All CRUD operations work correctly  
✅ Image upload to Supabase Storage succeeds  
✅ Form validation prevents invalid submissions  
✅ RLS policies enforce access control  
✅ UI matches grey/black/white theme  
✅ Error messages are clear and helpful  
✅ Products appear in storefront when active  
✅ Storage cleanup works on delete  

## Notes

- All operations use the existing `supabase` client
- RLS policies enforce owner/admin permissions
- No service-role key is used or exposed
- Image files are stored as `{productId}/{timestamp-random}.{ext}`
- Old images are not cleaned up when editing (feature for future enhancement)

## Support

For issues or questions:
1. Check browser console for detailed errors
2. Verify Supabase Storage bucket exists
3. Verify user has owner/admin role
4. Check network tab for API errors
