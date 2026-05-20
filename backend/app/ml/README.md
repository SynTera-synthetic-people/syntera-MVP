# SynTera ML Pipeline

ML models for predicting user behavior from Actions Data (sync_actions table).

## Architecture

- **15 behavioral features** extracted from transaction history
- **20 base models** (5 algorithms × 4 domains)
- **4 meta-models** (1 per domain) that learn optimal combinations

## Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Run Complete Training
```bash
python train_all.py
```

This will:
1. Extract data from `sync_actions` table
2. Build feature dataset (saved to `data/features.csv`)
3. Train 5 base models per domain
4. Train meta-models
5. Validate predictions

### 3. Test Predictions
```bash
python models/predict.py
```

## Features Extracted

### Frequency (5)
- orders_per_week
- growth_rate
- recency_weighted_frequency
- volatility
- trend_slope

### Monetary (5)
- avg_order_value
- spending_trend
- price_sensitivity
- basket_size
- discount_usage_rate

### Temporal (5)
- night_order_ratio
- weekend_ratio
- peak_hour_preference
- seasonality_index
- inter_order_time

## Models

### Base Models (5 per domain)
1. XGBoost
2. LightGBM
3. CatBoost
4. Random Forest
5. Neural Network

### Meta-Model
- Gradient Boosting that learns optimal weights

## File Structure

syntera-ml-pipeline/
├── data/
│   └── features.csv              # Generated features
├── features/
│   └── feature_engineering.py    # Feature extraction
├── models/
│   ├── saved/                    # Trained models
│   ├── base_models.py            # 5 base algorithms
│   ├── meta_model.py             # Meta-model training
│   └── predict.py                # Prediction pipeline
├── train_all.py                  # Complete training script
└── requirements.txt

## Usage in API

```python
from models.predict import MLPredictor

# Initialize predictor for domain
predictor = MLPredictor('food')

# Make prediction
result = predictor.predict(features_dict)

print(result['prediction'])      # 2.34 orders/week
print(result['confidence'])      # 0.96 (96%)
print(result['confidence_label'])  # "VERY HIGH"
```

## Next Steps

1. Integrate prediction endpoint into FastAPI backend
2. Add retraining scheduler
3. Monitor model performance