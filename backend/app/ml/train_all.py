#!/usr/bin/env python3
"""
Complete ML Pipeline Training Script
Runs all steps from data extraction to model saving
"""

import sys
import os
from datetime import datetime
import pandas as pd

# Add current directory to path
sys.path.insert(0, os.path.dirname(__file__))

def main():
    print("="*70)
    print("SYNTERA ML PIPELINE - COMPLETE TRAINING")
    print("="*70)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    
    # Check if features already exist
    features_path = os.path.join(os.path.dirname(__file__), 'data', 'features.csv')
    
    if os.path.exists(features_path):
        print("\n[STEP 1/4] Loading Existing Features")
        print("-" * 70)
        print(f"✅ Found existing features.csv, skipping feature engineering...")
        features_df = pd.read_csv(features_path)
        print(f"   Loaded {len(features_df):,} user-domain pairs")
        print(f"   Domains: {features_df['domain'].unique().tolist()}")
    else:
        # Step 1: Feature Engineering
        print("\n[STEP 1/4] Feature Engineering")
        print("-" * 70)
        from features.feature_engineering import extract_actions_data, build_feature_dataset
        
        print("Extracting actions data from sync_action.record table...")
        actions_df = extract_actions_data()
        
        print("\nBuilding feature dataset...")
        features_df = build_feature_dataset(actions_df, min_transactions=5)
    
    # Step 2: Train Base Models
    print("\n[STEP 2/4] Training Base Models (5 per domain)")
    print("-" * 70)
    from models.base_models import BaseModelTrainer
    
    domains = features_df['domain'].unique()
    trained_domains = []
    
    for domain in domains:
        domain_data = features_df[features_df['domain'] == domain]
        
        if len(domain_data) < 50:
            print(f"\n⚠️  Skipping {domain} - insufficient data ({len(domain_data)} samples)")
            continue
        
        try:
            print(f"\nTraining {domain.upper()}...")
            trainer = BaseModelTrainer(domain)
            trainer.train_all(features_df)
            trainer.save_models()
            trained_domains.append(domain)
        except Exception as e:
            print(f"❌ Error training {domain}: {str(e)}")
            import traceback
            traceback.print_exc()
    
    if len(trained_domains) == 0:
        print("\n❌ No models trained! Exiting...")
        return
    
    # Step 3: Train Meta-Models
    print("\n[STEP 3/4] Training Meta-Models")
    print("-" * 70)
    from models.meta_model import train_all_meta_models
    
    train_all_meta_models(features_df)
    
    # Step 4: Validation
    print("\n[STEP 4/4] Validating Pipeline")
    print("-" * 70)
    from models.predict import MLPredictor
    
    for domain in trained_domains:
        try:
            domain_data = features_df[features_df['domain'] == domain]
            if len(domain_data) > 0:
                predictor = MLPredictor(domain)
                sample = domain_data.iloc[0]
                features = {col: sample[col] for col in predictor.feature_columns}
                result = predictor.predict(features)
                print(f"✅ {domain.upper()}: Prediction={result['prediction']:.2f}, " +
                      f"Confidence={result['confidence']:.2%} ({result['confidence_label']})")
        except Exception as e:
            print(f"❌ {domain.upper()}: Validation failed - {str(e)}")
    
    # Summary
    print("\n" + "="*70)
    print("✅ TRAINING COMPLETE!")
    print("="*70)
    print(f"Finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"\nModels trained for domains: {', '.join([d.upper() for d in trained_domains])}")
    print(f"Total models saved: {len(trained_domains) * 6} (5 base + 1 meta per domain)")
    print("\nFiles created:")
    print("  - data/features.csv")
    print("  - models/saved/*.joblib")
    print("\nNext steps:")
    print("  1. Test predictions: python models/predict.py")
    print("  2. Integrate into API endpoint")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Training interrupted by user")
    except Exception as e:
        print(f"\n\n❌ Training failed: {str(e)}")
        import traceback
        traceback.print_exc()