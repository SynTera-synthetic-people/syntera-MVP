"""
Retrain only finance domain models
"""

import pandas as pd
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

print("\n" + "="*70)
print("RETRAINING FINANCE MODELS")
print("="*70)

# Load cleaned features
features_df = pd.read_csv('data/features_clean.csv')
finance_df = features_df[features_df['domain'] == 'finance']

print(f"\nFinance users: {len(finance_df):,}")
print(f"Features: {[col for col in finance_df.columns if col not in ['subject_key', 'domain', 'total_transactions']]}")

# Train base models
print("\n[STEP 1/2] Training Base Models")
print("-" * 70)

from models.base_models import BaseModelTrainer

try:
    trainer = BaseModelTrainer('finance')
    results, data = trainer.train_all(features_df)
    trainer.save_models()
    
    print("\n✅ Base models trained successfully!")
    
except Exception as e:
    print(f"\n❌ Error: {str(e)}")
    import traceback
    traceback.print_exc()
    exit(1)

# Train meta-model
print("\n[STEP 2/2] Training Meta-Model")
print("-" * 70)

from models.meta_model import MetaModelTrainer

try:
    meta_trainer = MetaModelTrainer('finance')
    meta_trainer.load_base_models()
    
    X_train, X_test, y_train, y_test = data
    meta_trainer.train(X_train, y_train, X_test, y_test)
    meta_trainer.save()
    
    print("\n✅ Meta-model trained successfully!")
    
except Exception as e:
    print(f"\n❌ Error: {str(e)}")
    import traceback
    traceback.print_exc()
    exit(1)

# Test prediction
print("\n[VALIDATION] Testing Predictions")
print("-" * 70)

from models.predict import MLPredictor

try:
    predictor = MLPredictor('finance')
    sample = finance_df.iloc[0]
    features = {col: sample[col] for col in predictor.feature_columns}
    result = predictor.predict(features)
    
    print(f"✅ FINANCE: Prediction={result['prediction']:.2f}, Confidence={result['confidence']:.2%} ({result['confidence_label']})")
    
except Exception as e:
    print(f"❌ Validation failed: {str(e)}")

print("\n" + "="*70)
print("✅ FINANCE DOMAIN FIXED!")
print("="*70)