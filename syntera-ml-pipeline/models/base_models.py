"""
Base Model Training
Trains 5 ML algorithms per domain (XGBoost, LightGBM, CatBoost, RF, NN)
"""

import sys
import os
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import xgboost as xgb
import lightgbm as lgb
from catboost import CatBoostRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.neural_network import MLPRegressor
import joblib

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../backend')))


class BaseModelTrainer:
    """
    Train 5 base models for a domain
    """
    
    def __init__(self, domain):
        self.domain = domain
        self.models = {}
        self.feature_columns = None
        
    def prepare_data(self, features_df, target_column='orders_per_week'):
        """
        Prepare training data
        """
        # Filter to domain
        df = features_df[features_df['domain'] == self.domain].copy()
        
        print(f"\n{'='*60}")
        print(f"Preparing data for domain: {self.domain.upper()}")
        print(f"{'='*60}")
        print(f"Total samples: {len(df):,}")
        
        if len(df) < 50:
            raise ValueError(f"Insufficient data for {self.domain}. Need at least 50 samples, got {len(df)}")
        
        # Feature columns (exclude metadata and target)
        exclude_cols = ['subject_key', 'user_id', 'domain', 'total_transactions', target_column]
        self.feature_columns = [col for col in df.columns if col not in exclude_cols]
        
        print(f"Features: {len(self.feature_columns)}")
        print(f"Target: {target_column}")
        
        # Prepare X and y
        X = df[self.feature_columns].values
        y = df[target_column].values
        
        # Fill NaN values with 0 (for Random Forest & Neural Network)
        import numpy as np
        X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
        
        # Train-test split (80-20)
        from sklearn.model_selection import train_test_split
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        
        print(f"Train samples: {len(X_train):,}")
        print(f"Test samples: {len(X_test):,}")
        
        return X_train, X_test, y_train, y_test
    
    def train_xgboost(self, X_train, y_train, X_test, y_test):
        """Train XGBoost model"""
        print("\n🚀 Training XGBoost...")
        
        model = xgb.XGBRegressor(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.1,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            n_jobs=-1
        )
        
        model.fit(
            X_train, y_train,
            eval_set=[(X_test, y_test)],
            verbose=False
        )
        
        predictions = model.predict(X_test)
        mae = mean_absolute_error(y_test, predictions)
        rmse = np.sqrt(mean_squared_error(y_test, predictions))
        r2 = r2_score(y_test, predictions)
        
        print(f"   MAE: {mae:.4f} | RMSE: {rmse:.4f} | R²: {r2:.4f}")
        
        self.models['xgboost'] = model
        return mae, rmse, r2
    
    def train_lightgbm(self, X_train, y_train, X_test, y_test):
        """Train LightGBM model"""
        print("\n🚀 Training LightGBM...")
        
        model = lgb.LGBMRegressor(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.1,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            n_jobs=-1,
            verbose=-1
        )
        
        model.fit(
            X_train, y_train,
            eval_set=[(X_test, y_test)],
            callbacks=[lgb.early_stopping(20, verbose=False)]
        )
        
        predictions = model.predict(X_test)
        mae = mean_absolute_error(y_test, predictions)
        rmse = np.sqrt(mean_squared_error(y_test, predictions))
        r2 = r2_score(y_test, predictions)
        
        print(f"   MAE: {mae:.4f} | RMSE: {rmse:.4f} | R²: {r2:.4f}")
        
        self.models['lightgbm'] = model
        return mae, rmse, r2
    
    def train_catboost(self, X_train, y_train, X_test, y_test):
        """Train CatBoost model"""
        print("\n🚀 Training CatBoost...")
        
        model = CatBoostRegressor(
            iterations=200,
            depth=6,
            learning_rate=0.1,
            random_state=42,
            verbose=False
        )
        
        model.fit(
            X_train, y_train,
            eval_set=(X_test, y_test),
            early_stopping_rounds=20,
            verbose=False
        )
        
        predictions = model.predict(X_test)
        mae = mean_absolute_error(y_test, predictions)
        rmse = np.sqrt(mean_squared_error(y_test, predictions))
        r2 = r2_score(y_test, predictions)
        
        print(f"   MAE: {mae:.4f} | RMSE: {rmse:.4f} | R²: {r2:.4f}")
        
        self.models['catboost'] = model
        return mae, rmse, r2
    
    def train_random_forest(self, X_train, y_train, X_test, y_test):
        """Train Random Forest model"""
        print("\n🚀 Training Random Forest...")
        
        model = RandomForestRegressor(
            n_estimators=200,
            max_depth=10,
            min_samples_split=5,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1
        )
        
        model.fit(X_train, y_train)
        
        predictions = model.predict(X_test)
        mae = mean_absolute_error(y_test, predictions)
        rmse = np.sqrt(mean_squared_error(y_test, predictions))
        r2 = r2_score(y_test, predictions)
        
        print(f"   MAE: {mae:.4f} | RMSE: {rmse:.4f} | R²: {r2:.4f}")
        
        self.models['random_forest'] = model
        return mae, rmse, r2
    
    def train_neural_network(self, X_train, y_train, X_test, y_test):
        """Train Neural Network model"""
        print("\n🚀 Training Neural Network...")
        
        model = MLPRegressor(
            hidden_layer_sizes=(128, 64, 32),
            activation='relu',
            solver='adam',
            alpha=0.001,
            batch_size=32,
            learning_rate='adaptive',
            max_iter=300,
            early_stopping=True,
            validation_fraction=0.1,
            random_state=42
        )
        
        model.fit(X_train, y_train)
        
        predictions = model.predict(X_test)
        mae = mean_absolute_error(y_test, predictions)
        rmse = np.sqrt(mean_squared_error(y_test, predictions))
        r2 = r2_score(y_test, predictions)
        
        print(f"   MAE: {mae:.4f} | RMSE: {rmse:.4f} | R²: {r2:.4f}")
        
        self.models['neural_net'] = model
        return mae, rmse, r2
    
    def train_all(self, features_df, target_column='orders_per_week'):
        """
        Train all 5 base models
        """
        # Prepare data
        X_train, X_test, y_train, y_test = self.prepare_data(features_df, target_column)
        
        # Train each model
        results = {}
        results['xgboost'] = self.train_xgboost(X_train, y_train, X_test, y_test)
        results['lightgbm'] = self.train_lightgbm(X_train, y_train, X_test, y_test)
        results['catboost'] = self.train_catboost(X_train, y_train, X_test, y_test)
        results['random_forest'] = self.train_random_forest(X_train, y_train, X_test, y_test)
        results['neural_net'] = self.train_neural_network(X_train, y_train, X_test, y_test)
        
        print(f"\n{'='*60}")
        print(f"✅ All 5 base models trained for {self.domain.upper()}")
        print(f"{'='*60}")
        
        # Print summary
        print("\nModel Performance Summary:")
        print(f"{'Model':<20} {'MAE':<12} {'RMSE':<12} {'R²':<10}")
        print("-" * 60)
        for model_name, (mae, rmse, r2) in results.items():
            print(f"{model_name:<20} {mae:<12.4f} {rmse:<12.4f} {r2:<10.4f}")
        
        return results, (X_train, X_test, y_train, y_test)
    
    def save_models(self, output_dir='saved'):  # ← Change from 'models/saved' to 'saved'
        """Save all trained models"""
        # Create absolute path
        base_path = os.path.dirname(__file__)
        full_output_dir = os.path.join(base_path, output_dir)
        os.makedirs(full_output_dir, exist_ok=True)
        
        print(f"\n{'='*60}")
        print(f"Saving models to {full_output_dir}")
        print(f"{'='*60}")
        
        for model_name, model in self.models.items():
            filepath = os.path.join(full_output_dir, f"{self.domain}_{model_name}.joblib")
            joblib.dump(model, filepath)
            print(f"✅ Saved: {model_name} → {os.path.basename(filepath)}")
        
        # Save feature columns
        feature_file = os.path.join(full_output_dir, f"{self.domain}_features.joblib")
        joblib.dump(self.feature_columns, feature_file)
        print(f"✅ Saved: feature columns → {os.path.basename(feature_file)}")

if __name__ == "__main__":
    print("\n" + "="*70)
    print("SYNTERA ML PIPELINE - BASE MODEL TRAINING")
    print("="*70)
    
    # Load features
    features_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'features.csv')
    
    if not os.path.exists(features_path):
        print(f"\n❌ Error: {features_path} not found!")
        print("Run 'python features/feature_engineering.py' first")
        exit(1)
    
    features_df = pd.read_csv(features_path)
    print(f"\n✅ Loaded features: {features_df.shape}")
    
    # Train for each domain
    domains = features_df['domain'].unique()
    
    for domain in domains:
        domain_data = features_df[features_df['domain'] == domain]
        
        print(f"\n{'#'*70}")
        print(f"# DOMAIN: {domain.upper()}")
        print(f"{'#'*70}")
        
        if len(domain_data) < 50:
            print(f"\n⚠️  Skipping {domain} - insufficient data ({len(domain_data)} samples, need 50+)")
            continue
        
        try:
            trainer = BaseModelTrainer(domain)
            results, data = trainer.train_all(features_df)
            trainer.save_models()
        except Exception as e:
            print(f"\n❌ Error training {domain}: {str(e)}")
            continue
    
    print("\n" + "="*70)
    print("✅ BASE MODEL TRAINING COMPLETE!")
    print("="*70)
    print("\nNext step: Train meta-models with 'python models/meta_model.py'")