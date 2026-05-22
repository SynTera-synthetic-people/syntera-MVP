"""
Hyperparameter tuning using GridSearchCV
"""
import pandas as pd
from sklearn.model_selection import GridSearchCV
import xgboost as xgb
from catboost import CatBoostRegressor
import joblib

# Load features
df = pd.read_csv('data/features_clean_v2.csv')

# For each domain
for domain in ['ecom', 'food', 'mobility', 'finance']:
    print(f"\n{'='*70}")
    print(f"TUNING {domain.upper()}")
    print(f"{'='*70}")
    
    domain_data = df[df['domain'] == domain]
    
    # Prepare data
    exclude = ['subject_key', 'domain', 'total_transactions', 'orders_per_week']
    features = [col for col in domain_data.columns if col not in exclude]
    
    X = domain_data[features].values
    y = domain_data['orders_per_week'].values
    
    # XGBoost tuning
    print("\nTuning XGBoost...")
    xgb_params = {
        'n_estimators': [200, 300, 500],
        'max_depth': [4, 6, 8, 10],
        'learning_rate': [0.01, 0.05, 0.1],
        'subsample': [0.7, 0.8, 0.9],
        'colsample_bytree': [0.7, 0.8, 0.9]
    }
    
    xgb_model = xgb.XGBRegressor(random_state=42, n_jobs=-1)
    grid_search = GridSearchCV(xgb_model, xgb_params, cv=5, scoring='r2', n_jobs=-1, verbose=1)
    grid_search.fit(X, y)
    
    print(f"Best XGBoost params: {grid_search.best_params_}")
    print(f"Best score: {grid_search.best_score_:.4f}")
    
    # Save best model
    joblib.dump(grid_search.best_estimator_, f'models/saved/{domain}_xgboost_tuned.joblib')
    
    # CatBoost tuning
    print("\nTuning CatBoost...")
    cat_params = {
        'iterations': [200, 300, 500],
        'depth': [4, 6, 8, 10],
        'learning_rate': [0.01, 0.05, 0.1]
    }
    
    cat_model = CatBoostRegressor(random_state=42, verbose=False)
    grid_search = GridSearchCV(cat_model, cat_params, cv=5, scoring='r2', n_jobs=-1)
    grid_search.fit(X, y)
    
    print(f"Best CatBoost params: {grid_search.best_params_}")
    print(f"Best score: {grid_search.best_score_:.4f}")
    
    joblib.dump(grid_search.best_estimator_, f'models/saved/{domain}_catboost_tuned.joblib')

print("\n✅ Hyperparameter tuning complete!")