# Category Mapping Integration - AI Product Enrichment

## Overview

This PR extends the existing AI product enrichment pipeline to support **category mapping** in addition to translation. The system evolves from a translation-only service to a comprehensive **AI enrichment platform** that can simultaneously handle translation, category classification, and future image enhancement operations.

## What's Changed

### 🎯 Core Changes

#### 1. **Unified Enrichment Pipeline** (`ProductController.js`)

- **Renamed**: `translateProductField()` endpoint now supports multi-operation enrichment
- **New parameter structure**: Request body changed from a simple array to a structured object:
  ```javascript
  {
    translateFields: [{field, lang}],  // Translation operations
    mapCategories: boolean,             // Enable category mapping
    enhanceImages: boolean              // Reserved for future use
  }
  ```
- **Parallel execution**: Multiple jobs (translate + map categories) can run simultaneously for a single seller
- **Progress tracking**: Separate progress streams for translate and category mapping operations

#### 2. **Category Mapping Service Integration** (`ProductController.js`)

- Imported `mapCategoryTrail` service from `categoryMapService.js`
- Integrated category map progress helpers (`geminiCategoryMap.js`)
- Added category mapping operation labels via `operationLabels.js`
- **Workflow**: Products are classified against channel categories CSV (stored in `CHANNEL_CATEGORIES_CSV` env var) using Gemini AI
- **Result**: Humanized category path written to `categoryTrail` field on each product

#### 3. **Enhanced Progress Status Tracking** (`ProductController.js`)

- **Old**: Single operation type (`translate`)
- **New**: Multi-type support (`ai-enrich`, `sync`)
- **Multiple operations per type**:
  - `ai-enrich` contains both translate operations and category mapping
  - Each operation has its own label, status, and progress
- **Aggregated status**: Overall completion state considers all active operations
- **Response structure**: Grouped by type with detailed operation metadata

### 📝 Configuration Changes

#### `config.js`

- Added `CHANNEL_CATEGORIES_CSV` config variable (environment-based)
- Used by the category mapping service to load available channel categories

### 🌍 Localization Updates

Updated all language files (EN, AR, TR, ZH-CN):

- `TRANSLATION_STARTED` → `ENRICHMENT_STARTED`
- `NO_PRODUCTS_TO_TRANSLATE` → `NO_PRODUCTS_TO_ENRICH`
- `NO_ACTIVE_TRANSLATION` → `NO_ACTIVE_ENRICHMENT`
- `TRANSLATION_ALREADY_RUNNING` → `ENRICHMENT_ALREADY_RUNNING`
- `TRANSLATION_FAILED` → `ENRICHMENT_FAILED`
- `TRANSLATION_COMPLETED` → `ENRICHMENT_COMPLETED`
- Removed `TRANSLATION_IN_PROGRESS` (now dynamic via operation labels)

### 📚 API Documentation Updates (`product.js`)

#### POST `/products/translate-field`

- Updated summary and description to reflect multi-operation support
- Added `productId` query parameter (optional) to enrich specific product
- Request body now documents:
  - `translateFields` array (optional, non-empty for translation)
  - `mapCategories` boolean (optional, true to enable category mapping)
  - `enhanceImages` boolean (optional, reserved for future)
- Added validation: at least one operation must be specified

#### GET `/products/progress-status`

- Updated summary to reflect unified enrichment tracking
- `type` parameter now supports comma-separated values: `ai-enrich`, `sync`
- Response schema updated to show aggregated status + per-type results
- Operations now include `label` field for user-friendly display

### ✅ Input Validation (`products.js`)

#### translateProductFieldValidator

- Extended query schema to support optional `productId` parameter
- Refactored body validation:
  - `translateFields` is now optional (but if provided, must be non-empty array)
  - Added `mapCategories` and `enhanceImages` boolean fields
  - **Refine rule**: At least one of the three operations must be provided
  - Better error messages mentioning specific operation names

### 🔧 Helper Updates (`geminiTranslate.js`)

- **setPendingProgress()** now accepts `translateFields` parameter
- Initializes progress operations with provided field/lang pairs
- Pre-allocates operation structure for better tracking

## Features & Capabilities

✨ **Multi-operation enrichment**: Run translation, category mapping, and future enhancements in parallel
✨ **Per-operation progress tracking**: Each job has granular status (pending, running, done, error)
✨ **Selective execution**: Enable only the operations you need
✨ **Detailed error handling**: Operation-level error reporting with retry info
✨ **User-friendly labels**: Each operation has a humanized label (e.g., "Translate Description to Arabic")
✨ **Future-proof architecture**: Easy to add new enrichment operations (enhance images, etc.)

## Example Usage

### Run translation + category mapping together

```bash
POST /products/translate-field
{
  "translateFields": [
    {"field": "nameAr", "lang": "en"},
    {"field": "descriptionAr", "lang": "en"}
  ],
  "mapCategories": true
}
```

### Check multi-type progress

```bash
GET /products/progress-status?type=ai-enrich,sync
```

Response includes aggregated status + per-type operation details.

## Files Modified

- `src/config/config.js` - Added CHANNEL_CATEGORIES_CSV
- `src/controllers/ProductController.js` - Core enrichment pipeline refactor
- `src/helpers/geminiTranslate.js` - Enhanced progress initialization
- `src/routes/product.js` - Updated OpenAPI documentation
- `src/validations/products.js` - Enhanced request validation
- `src/locales/{ar,en,tr,zh-CN}.json` - Message updates

## Dependencies & Integration Points

- **New**: `categoryMapService.js` - Provides `mapCategoryTrail()` function
- **New**: `geminiCategoryMap.js` - Progress tracking helpers
- **New**: `operationLabels.js` - Label builders for operations
- **Environment**: `CHANNEL_CATEGORIES_CSV` must be set for category mapping

## Testing Recommendations

1. Test single-operation requests (translate-only, category-map-only)
2. Test multi-operation requests (translate + categories)
3. Verify progress tracking for both operation types
4. Test error handling and retry mechanisms
5. Validate category trail output format
6. Confirm parallel execution doesn't cause race conditions
7. Test with `productId` filter (single product enrichment)

## Breaking Changes

- ✅ Request body structure changed from array to object
  - **Mitigation**: Validation provides clear error messages
- ✅ Progress status response structure changed
  - **Mitigation**: API documentation updated with examples

## Future Work

- Image enhancement operation implementation
- Additional enrichment operations
- Performance optimization for large product catalogs
- Enhanced retry strategies with exponential backoff
