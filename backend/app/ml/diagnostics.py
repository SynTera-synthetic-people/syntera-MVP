"""
ML System Diagnostics - No Emojis Version
"""

import pandas as pd
import numpy as np
import os
import joblib
from models.base_models import BaseModelTrainer

print("="*70)
print("SYNTERA ML DIAGNOSTICS")
print("="*70)

# Load features
try:
    features_df = pd.read_csv('data/features_clean.csv')
except FileNotFoundError:
    try:
        features_df = pd.read_csv('data/features.csv')
    except FileNotFoundError:
        print("ERROR: No features file found. Run feature_engineering.py first.")
        exit(1)

print("\n" + "="*70)
print("1. DATA QUALITY REPORT")
print("="*70)

print(f"\nDataset Shape: {features_df.shape}")
print(f"   Rows: {len(features_df):,}")
print(f"   Columns: {len(features_df.columns)}")

print("\nDomain Distribution:")
print(features_df['domain'].value_counts())

print("\nMissing Values:")
null_counts = features_df.isnull().sum()
if null_counts.sum() > 0:
    print(null_counts[null_counts > 0])
else:
    print("   No missing values")

print("\nFeature Statistics:")
print(features_df.describe())

print("\nTarget Variable (orders_per_week):")
print(f"   Mean: {features_df['orders_per_week'].mean():.2f}")
print(f"   Median: {features_df['orders_per_week'].median():.2f}")
print(f"   Std: {features_df['orders_per_week'].std():.2f}")
print(f"   Min: {features_df['orders_per_week'].min():.2f}")
print(f"   Max: {features_df['orders_per_week'].max():.2f}")

outliers_95 = features_df['orders_per_week'] > features_df['orders_per_week'].quantile(0.95)
print(f"   Outliers (>95th percentile): {outliers_95.sum()} ({outliers_95.sum()/len(features_df)*100:.1f}%)")

print("\n" + "="*70)
print("2. FEATURE IMPORTANCE ANALYSIS")
print("="*70)

for domain in ['ecom', 'food', 'mobility', 'finance']:
    print(f"\n{domain.upper()} Domain:")
    
    domain_data = features_df[features_df['domain'] == domain]
    if len(domain_data) < 50:
        print(f"   WARNING: Insufficient data ({len(domain_data)} samples)")
        continue
    
    print(f"   Samples: {len(domain_data):,}")
    
    model_path = f'models/saved/{domain}_xgboost.joblib'
    if os.path.exists(model_path):
        model = joblib.load(model_path)
        features_path = f'models/saved/{domain}_features.joblib'
        feature_columns = joblib.load(features_path)
        
        importance = model.feature_importances_
        
        print("\n   Top 10 Most Important Features:")
        for i, (feat, imp) in enumerate(sorted(zip(feature_columns, importance), 
                                               key=lambda x: x[1], reverse=True)[:10], 1):
            bar = '=' * int(imp * 50)
            print(f"   {i:2d}. {feat:<30} {imp:.4f} {bar}")
    else:
        print(f"   WARNING: Model not found")

print("\n" + "="*70)
print("3. ERROR ANALYSIS")
print("="*70)

for domain in ['ecom', 'food', 'mobility', 'finance']:
    domain_data = features_df[features_df['domain'] == domain]
    
    if len(domain_data) < 50:
        continue
    
    print(f"\n{domain.upper()} Domain Error Analysis:")
    
    try:
        trainer = BaseModelTrainer(domain)
        X_train, X_test, y_train, y_test = trainer.prepare_data(features_df)
        
        model_path = f'models/saved/{domain}_xgboost.joblib'
        if os.path.exists(model_path):
            model = joblib.load(model_path)
            predictions = model.predict(X_test)
            
            errors = y_test - predictions
            abs_errors = np.abs(errors)
            pct_errors = np.abs(errors / np.where(y_test == 0, 1, y_test)) * 100
            
            print(f"   Mean Absolute Error: {np.mean(abs_errors):.2f}")
            print(f"   Median Absolute Error: {np.median(abs_errors):.2f}")
            print(f"   Max Error: {np.max(abs_errors):.2f}")
            print(f"   Mean Percentage Error: {np.nanmean(pct_errors):.1f}%")
            print(f"\n   Predictions within:")
            print(f"   - 10% of actual: {(pct_errors < 10).sum()/len(pct_errors)*100:.1f}%")
            print(f"   - 20% of actual: {(pct_errors < 20).sum()/len(pct_errors)*100:.1f}%")
            print(f"   - 50% of actual: {(pct_errors < 50).sum()/len(pct_errors)*100:.1f}%")
            
            worst_5 = np.argsort(abs_errors)[-5:]
            print(f"\n   5 Worst Predictions:")
            for i, idx in enumerate(worst_5, 1):
                print(f"   {i}. Actual: {y_test[idx]:.2f}, Predicted: {predictions[idx]:.2f}, Error: {errors[idx]:.2f}")
                
    except Exception as e:
        print(f"   ERROR: {str(e)}")

print("\n" + "="*70)
print("4. MODEL PERFORMANCE COMPARISON")
print("="*70)

for domain in ['ecom', 'food', 'mobility', 'finance']:
    domain_data = features_df[features_df['domain'] == domain]
    
    if len(domain_data) < 50:
        continue
    
    print(f"\n{domain.upper()} Domain:")
    
    results = {}
    
    for model_name in ['xgboost', 'lightgbm', 'catboost', 'random_forest', 'neural_net']:
        model_path = f'models/saved/{domain}_{model_name}.joblib'
        
        if os.path.exists(model_path):
            try:
                trainer = BaseModelTrainer(domain)
                X_train, X_test, y_train, y_test = trainer.prepare_data(features_df)
                
                model = joblib.load(model_path)
                predictions = model.predict(X_test)
                
                from sklearn.metrics import r2_score
                r2 = r2_score(y_test, predictions)
                results[model_name] = r2
                
            except Exception as e:
                results[model_name] = None
    
    if results:
        print(f"\n   Model R2 Scores:")
        for model_name, r2 in sorted(results.items(), 
                                     key=lambda x: x[1] if x[1] else -999, 
                                     reverse=True):
            if r2 is not None:
                bar = '=' * int(max(0, r2) * 50)
                print(f"   {model_name:<20} {r2:>7.2%} {bar}")

print("\n" + "="*70)
print("5. DATA DISTRIBUTION ANALYSIS")
print("="*70)

for domain in ['ecom', 'food', 'mobility', 'finance']:
    domain_data = features_df[features_df['domain'] == domain]
    
    if len(domain_data) < 50:
        continue
    
    print(f"\n{domain.upper()} Domain:")
    print(f"   Total users: {len(domain_data):,}")
    print(f"   Avg orders/week: {domain_data['orders_per_week'].mean():.2f}")
    print(f"   Median orders/week: {domain_data['orders_per_week'].median():.2f}")
    
    print(f"\n   Percentiles:")
    for p in [25, 50, 75, 90, 95, 99]:
        val = domain_data['orders_per_week'].quantile(p/100)
        print(f"   {p}th: {val:.2f}")

print("\n" + "="*70)
print("DIAGNOSTICS COMPLETE")
print("="*70)