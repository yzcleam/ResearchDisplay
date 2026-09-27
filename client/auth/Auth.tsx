import { ArrowRight, Books, CheckCircle, ShieldCheck } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import type { User } from '../../shared/contracts';
import { errorMessage, setCsrf } from '../api';
import { Alert, Field } from '../components';
import { commands } from '../data/write-models';
export function Auth({ onLogin }: { onLogin: (user: User) => void }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (register) {
        if (data.password !== data.confirm_password) {
          throw new Error('两次输入的密码不一致');
        }
        await commands.register({
          email: String(data.email),
          password: String(data.password),
          real_name: String(data.real_name),
          institution: String(data.institution),
          invite_code: String(data.invite_code || '') || undefined,
        });
        setRegister(false);
        setNotice('注册成功，请使用邮箱和密码登录。');
      } else {
        const result = await commands.login({
          email: String(data.email),
          password: String(data.password),
        });
        setCsrf(result.csrf);
        onLogin(result.user);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Books size={26} />
          </span>
          <span>
            研序<small>RESEARCH ARCHIVE</small>
          </span>
        </a>
        <div className="story-content">
          <span className="eyebrow">课题组研究成果管理平台</span>
          <h1>
            让每一份研究，
            <br />
            有迹可循。
          </h1>
          <p>
            从一组数据到一篇论文，将研究材料、
            <br className="desktop-only" />
            分析过程与学术发现，妥善汇集在一起。
          </p>
          <div className="archive-art" aria-hidden="true">
            <div className="art-label">研究档案 / RESEARCH FILE</div>
            <div className="art-line long" />
            <div className="art-line" />
            <div className="art-chart">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <span>数据 · 机制 · 影响 · 启示</span>
          </div>
        </div>
        <footer>
          <ShieldCheck size={18} /> 课题组内部资料空间 <span>01 — 研究的积累，从这里开始</span>
        </footer>
      </section>
      <section className="auth-form-area">
        <div className="auth-form">
          <span className="eyebrow">欢迎来到研序</span>
          <h2>{register ? '加入研究资料库' : '登录研究工作台'}</h2>
          <p className="muted">
            {register
              ? '请填写真实姓名，便于成果归属与上传追溯。'
              : '使用您的课题组账号，继续整理研究成果。'}
          </p>
          <div className="segmented">
            <button
              onClick={() => {
                setRegister(false);
                setError('');
              }}
              className={!register ? 'selected' : ''}
            >
              账号登录
            </button>
            <button
              onClick={() => {
                setRegister(true);
                setError('');
              }}
              className={register ? 'selected' : ''}
            >
              实名注册
            </button>
          </div>
          <Alert>{error}</Alert>
          {notice && !register && (
            <div className="notice">
              <CheckCircle size={18} />
              {notice}
            </div>
          )}
          <form onSubmit={submit} key={register ? 'register' : 'login'}>
            {register && (
              <div className="form-grid">
                <Field label="真实姓名">
                  <input
                    name="real_name"
                    required
                    minLength={2}
                    maxLength={80}
                    autoComplete="name"
                  />
                </Field>
                <Field label="所属单位 / 课题组">
                  <input
                    name="institution"
                    required
                    minLength={2}
                    maxLength={160}
                    autoComplete="organization"
                  />
                </Field>
              </div>
            )}
            <Field label="邮箱">
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                placeholder="name@university.edu.cn"
              />
            </Field>
            <Field
              label="密码"
              hint={register ? '至少 10 位，可使用字母、数字与符号。' : undefined}
            >
              <input
                name="password"
                type="password"
                required
                minLength={register ? 10 : 1}
                maxLength={128}
                autoComplete={register ? 'new-password' : 'current-password'}
              />
            </Field>
            {register && (
              <>
                <Field label="确认密码">
                  <input
                    name="confirm_password"
                    type="password"
                    required
                    minLength={10}
                    maxLength={128}
                    autoComplete="new-password"
                  />
                </Field>
                <Field label="课题组邀请码（如管理员已设置）">
                  <input name="invite_code" maxLength={200} />
                </Field>
                <p className="small muted">
                  注册后即为研究成员，暂不需要验证邮箱。管理权限由管理员分配。
                </p>
              </>
            )}
            <button className="primary auth-submit" disabled={busy}>
              {busy ? '正在处理…' : register ? '创建研究账号' : '进入工作台'}
              <ArrowRight size={19} />
            </button>
          </form>
          <p className="auth-help">忘记密码或需要管理权限，请联系课题组管理员。</p>
        </div>
        <div className="auth-bottom">研究有序，知识长存。</div>
      </section>
    </main>
  );
}
